import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchWithRetry, zuperHeaders, chunks, sleep } from '@/lib/zuper-fetch'
import { buildProductPayload, type PriceFallback, type SrsProduct, type SrsVariant } from '@/lib/product-builder'
import { buildServicePayload } from '@/lib/service-builder'
import { SERVICE_CATALOG } from '@/lib/service-catalog'
import { ACCESSORY_PRODUCT_IDS } from '@/lib/accessory-catalog'
import { mapWithLimit } from '@/lib/limit'

const OPTION_GET_CONCURRENCY = 10

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { baseUrl, apiKey, productIds, categoryMap, warehouseUid, formulaMap, productTierFieldUid, selectedTrades = ['roofing'], serviceCategoryMap = {} } = await req.json() as {
    baseUrl: string
    apiKey: string
    productIds: number[]
    categoryMap: Record<string, string>
    warehouseUid: string
    formulaMap: Record<string, string>
    productTierFieldUid: string
    selectedTrades?: string[]
    serviceCategoryMap?: Record<string, string>
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false
      const emit = (data: object) => {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller is closed (client disconnected). Stop further enqueues.
          streamClosed = true
        }
      }
      req.signal.addEventListener('abort', () => { streamClosed = true })

      try {
        // Merge universal accessory IDs into the upload batch (deduplicated)
        const allProductIds = [...new Set([...ACCESSORY_PRODUCT_IDS, ...productIds])]

        // Fetch all products + their unrestricted variants
        const PAGE = 1000
        const allProducts: SrsProduct[] = []
        for (let from = 0; from < allProductIds.length; from += PAGE) {
          const chunk = allProductIds.slice(from, from + PAGE)
          const { data, error } = await supabase
            .from('srs_products')
            .select('product_id, product_name, product_category, manufacturer, manufacturer_norm, product_description, product_uom, product_image_url, suggested_price, purchase_price, proposal_line_item, family_tier')
            .in('product_id', chunk)
          if (error) throw new Error(error.message)
          allProducts.push(...(data as SrsProduct[]))
        }

        const allVariants: SrsVariant[] = []
        for (let from = 0; from < allProductIds.length; from += 500) {
          const chunk = allProductIds.slice(from, from + 500)
          const { data, error } = await supabase
            .from('srs_variants')
            .select('variant_id, product_id, variant_code, color_name, size_name, variant_image_url, is_restricted')
            .in('product_id', chunk)
            .eq('is_restricted', false)
          if (error) throw new Error(error.message)
          allVariants.push(...(data as SrsVariant[]))
        }

        // ── Pricing fallback ──────────────────────────────────────────────────
        // Only 5,646 / 19,807 products have a real `suggested_price`. The rest
        // would upload as $0 and break proposal math. Build a median map by
        // (category, family_tier) from the priced subset and pass it through —
        // products without a price use the closest match; those still without
        // a fallback land at 0 and are flagged via meta_data so CSMs can fix.
        const priceFallback: PriceFallback = { byCategoryTier: {}, byCategory: {} }
        try {
          const PAGE_PRICE = 1000
          const priced: { product_category: string; family_tier: string | null; suggested_price: number }[] = []
          let pfFrom = 0
          while (!streamClosed) {
            const { data, error } = await supabase
              .from('srs_products')
              .select('product_category, family_tier, suggested_price')
              .not('suggested_price', 'is', null)
              .gt('suggested_price', 0)
              .range(pfFrom, pfFrom + PAGE_PRICE - 1)
            if (error) break
            const rows = (data ?? []) as typeof priced
            priced.push(...rows)
            if (rows.length < PAGE_PRICE) break
            pfFrom += PAGE_PRICE
          }
          const byCT: Record<string, number[]> = {}
          const byC:  Record<string, number[]> = {}
          for (const p of priced) {
            const cat = p.product_category
            const tier = p.family_tier ?? 'unknown'
            const ckt = `${cat}|${tier}`
            ;(byCT[ckt] ??= []).push(Number(p.suggested_price))
            ;(byC[cat]  ??= []).push(Number(p.suggested_price))
          }
          const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
          for (const [k, arr] of Object.entries(byCT)) priceFallback.byCategoryTier[k] = median(arr)
          for (const [k, arr] of Object.entries(byC))  priceFallback.byCategory[k] = median(arr)
        } catch { /* non-fatal — uploaded prices land at 0 */ }

        // Group variants by product
        const variantsByProduct = new Map<number, SrsVariant[]>()
        for (const v of allVariants) {
          const arr = variantsByProduct.get(v.product_id) ?? []
          arr.push(v)
          variantsByProduct.set(v.product_id, arr)
        }

        // Build color→variant_code lookup: { product_id → { color_name → variant_code } }
        const variantCodeByColor = new Map<number, Map<string, string>>()
        for (const v of allVariants) {
          if (!v.variant_code || !v.color_name) continue
          if (!variantCodeByColor.has(v.product_id)) variantCodeByColor.set(v.product_id, new Map())
          variantCodeByColor.get(v.product_id)!.set(v.color_name.trim(), v.variant_code)
        }

        let uploaded = 0
        let updated = 0
        const errors: { productId: number; productName: string; message: string }[] = []
        const productIdMap: Record<string, string> = {}
        // colorCatalogMap: srs_product_id → [{color_name, variant_code, option_uid, purchase_price}]
        const colorCatalogMap: Record<string, Array<{ color_name: string; variant_code: string; option_uid: string; purchase_price: number | null }>> = {}
        const batches = chunks(allProducts, 100)

        // ── Idempotency: fetch existing Zuper products with their SRS product_id
        // stamp so we can PUT-update them instead of POSTing duplicates on rerun.
        // Cap at 250 pages (25k products) — guard against runaway loops on
        // accounts that have unrelated products. Errors here are non-fatal:
        // we fall back to POST-only mode and may create duplicates the operator
        // must manually clean.
        const existingByProductId = new Map<string, string>()
        try {
          let page = 1
          while (page <= 250 && !streamClosed) {
            const r = await fetchWithRetry(`${baseUrl}products?count=100&page=${page}`, {
              headers: zuperHeaders(apiKey),
            })
            const rows: { product_uid?: string; product_id?: string | number }[] = r.json?.data ?? []
            if (rows.length === 0) break
            for (const p of rows) {
              if (p.product_id && p.product_uid) {
                existingByProductId.set(String(p.product_id), p.product_uid)
              }
            }
            if (rows.length < 100) break
            page++
          }
          emit({ type: 'idempotency_scan', existingCount: existingByProductId.size })
        } catch (e: unknown) {
          // Non-fatal — fall back to POST-only
          emit({ type: 'idempotency_scan', existingCount: 0, warning: `Existing-product scan failed: ${(e as Error).message}. Re-uploads may create duplicates.` })
        }

        for (const [i, batch] of Array.from(batches.entries())) {
          // Phase A — POST all products in the batch in parallel. Capture which
          // ones need a follow-up GET to resolve option_uids (color-bearing products).
          const needGet: { srsId: number; zuperUid: string; product: SrsProduct }[] = []

          await Promise.allSettled(batch.map(async (product) => {
            const payload = buildProductPayload(
              product,
              variantsByProduct.get(product.product_id) ?? [],
              categoryMap,
              warehouseUid,
              formulaMap,
              productTierFieldUid,
              priceFallback,
            )
            try {
              const existingUid = existingByProductId.get(String(product.product_id))
              const isUpdate = !!existingUid
              const url = isUpdate ? `${baseUrl}product/${existingUid}` : `${baseUrl}product`
              const method = isUpdate ? 'PUT' : 'POST'
              // For PUT, include product_uid in the payload (Zuper convention).
              const finalPayload = isUpdate
                ? { ...payload, product: { ...payload.product, product_uid: existingUid } }
                : payload
              const r = await fetchWithRetry(url, {
                method,
                headers: zuperHeaders(apiKey),
                body: JSON.stringify(finalPayload),
              })
              if (r.ok && (r.json?.type === 'success' || r.json?.data)) {
                if (isUpdate) updated++
                else uploaded++
                const productData = Array.isArray(r.json?.data) ? r.json.data[0] : r.json?.data
                const zuperUid = productData?.product_uid ?? existingUid ?? ''
                if (zuperUid) productIdMap[String(product.product_id)] = zuperUid

                const productVariants = variantsByProduct.get(product.product_id) ?? []
                const hasColors = productVariants.some(v => {
                  const c = v.color_name?.trim()
                  return c && c !== 'N/A' && c.toLowerCase() !== 'na'
                })

                if (zuperUid && hasColors) {
                  // Defer the GET — process in Phase B with bounded concurrency
                  // so we don't serialize ~100 GETs after the POST batch.
                  needGet.push({ srsId: product.product_id, zuperUid, product })
                } else if (productVariants.some(v => v.variant_code)) {
                  // No color options — store all variant codes for vendor catalog (no option mapping)
                  const variantEntries = productVariants
                    .filter(v => v.variant_code)
                    .map(v => ({
                      color_name: '',
                      variant_code: v.variant_code ?? '',
                      option_uid: '',
                      purchase_price: product.purchase_price,
                    }))
                  if (variantEntries.length > 0) {
                    colorCatalogMap[String(product.product_id)] = variantEntries
                  }
                }

                emit({ type: 'progress', status: isUpdate ? 'updated' : 'success', productName: product.product_name, uploaded, updated, total: allProducts.length })
              } else {
                const msg = r.json?.message ?? JSON.stringify(r.json)
                errors.push({ productId: product.product_id, productName: product.product_name, message: msg })
                emit({ type: 'progress', status: 'error', productName: product.product_name, message: msg, uploaded, total: allProducts.length })
              }
            } catch (e: unknown) {
              const msg = (e as Error).message
              errors.push({ productId: product.product_id, productName: product.product_name, message: msg })
              emit({ type: 'progress', status: 'error', productName: product.product_name, message: msg, uploaded, total: allProducts.length })
            }
          }))

          // Phase B — fetch option_uids for color-bearing products in parallel
          // (capped at OPTION_GET_CONCURRENCY). Failures are non-fatal: the product
          // is already uploaded, only vendor-catalog option mapping is lost.
          if (needGet.length > 0 && !streamClosed) {
            await mapWithLimit(needGet, OPTION_GET_CONCURRENCY, async ({ srsId, zuperUid, product }) => {
              try {
                const getRes = await fetchWithRetry(`${baseUrl}product/${zuperUid}`, {
                  headers: zuperHeaders(apiKey),
                })
                const getProductData = Array.isArray(getRes.json?.data) ? getRes.json.data[0] : getRes.json?.data
                const optionValues: Array<{ option_uid: string; option_value: string }> = getProductData?.option?.option_values ?? []
                if (optionValues.length > 0) {
                  const colorMap = variantCodeByColor.get(srsId)
                  colorCatalogMap[String(srsId)] = optionValues.map(ov => ({
                    color_name: ov.option_value,
                    variant_code: colorMap?.get(ov.option_value) ?? '',
                    option_uid: ov.option_uid,
                    purchase_price: product.purchase_price,
                  }))
                }
              } catch { /* non-fatal — product is uploaded, vendor catalog skips this one */ }
            })
          }

          emit({ type: 'batch_complete', batch: i + 1, of: batches.length, uploaded, updated, errors: errors.length })
          if (streamClosed) break
          if (i < batches.length - 1) await sleep(3000)
        }

        // ── Phase 2: Upload services ──────────────────────────────────────────
        const servicesToUpload = SERVICE_CATALOG.filter(s =>
          s.trades.some(t => selectedTrades.includes(t)) &&
          serviceCategoryMap[s.category_key]
        )

        let servicesUploaded = 0
        const serviceErrors: { name: string; message: string }[] = []
        const serviceIdMap: Record<string, string> = {}

        if (servicesToUpload.length > 0) {
          emit({ type: 'services_start', total: servicesToUpload.length })

          await Promise.allSettled(servicesToUpload.map(async (service) => {
            const categoryUid = serviceCategoryMap[service.category_key]
            const payload = buildServicePayload(service, categoryUid)
            try {
              const r = await fetchWithRetry(`${baseUrl}product`, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify(payload),
              })
              if (r.ok && (r.json?.type === 'success' || r.json?.data)) {
                servicesUploaded++
                const serviceData = Array.isArray(r.json?.data) ? r.json.data[0] : r.json?.data
                const zuperUid = serviceData?.product_uid ?? ''
                if (zuperUid) serviceIdMap[service.id] = zuperUid
                emit({ type: 'service_progress', status: 'success', name: service.name, uploaded: servicesUploaded, total: servicesToUpload.length })
              } else {
                const msg = r.json?.message ?? JSON.stringify(r.json)
                serviceErrors.push({ name: service.name, message: msg })
                emit({ type: 'service_progress', status: 'error', name: service.name, message: msg, uploaded: servicesUploaded, total: servicesToUpload.length })
              }
            } catch (e: unknown) {
              const msg = (e as Error).message
              serviceErrors.push({ name: service.name, message: msg })
              emit({ type: 'service_progress', status: 'error', name: service.name, message: msg, uploaded: servicesUploaded, total: servicesToUpload.length })
            }
          }))
        }

        emit({ type: 'done', uploaded, updated, skipped: 0, errors, productIdMap, serviceIdMap, colorCatalogMap, servicesUploaded, serviceErrors })
        controller.close()
      } catch (e: unknown) {
        emit({ type: 'done', error: (e as Error).message, uploaded: 0, updated: 0, skipped: 0, errors: [] })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
