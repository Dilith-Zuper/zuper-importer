import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchWithRetry, zuperHeaders, chunks, sleep } from '@/lib/zuper-fetch'
import { buildProductPayload, type PriceFallback, type SrsProduct, type SrsVariant } from '@/lib/product-builder'
import { buildServicePayload } from '@/lib/service-builder'
import { SERVICE_CATALOG } from '@/lib/service-catalog'
import { ACCESSORY_PRODUCT_IDS } from '@/lib/accessory-catalog'
import { QXO_ACCESSORY_PRODUCT_KEYS } from '@/lib/qxo-accessory-catalog'
import { ABC_ACCESSORY_PRODUCT_IDS } from '@/lib/abc-accessory-catalog'
import { mapWithLimit } from '@/lib/limit'
import { catalogConfig } from '@/lib/catalog-source'
import type { CatalogSource } from '@/types/wizard'

const OPTION_GET_CONCURRENCY = 10

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const {
    baseUrl, apiKey, productIds, categoryMap, warehouseUid, formulaMap,
    productTierFieldUid, selectedTrades = ['roofing'], serviceCategoryMap = {},
    catalogSource = 'srs',
  } = await req.json() as {
    baseUrl: string
    apiKey: string
    productIds: (number | string)[]
    categoryMap: Record<string, string>
    warehouseUid: string
    formulaMap: Record<string, string>
    productTierFieldUid: string
    selectedTrades?: string[]
    serviceCategoryMap?: Record<string, string>
    catalogSource?: CatalogSource
  }

  const cfg = catalogConfig(catalogSource)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false
      const emit = (data: object) => {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          streamClosed = true
        }
      }
      req.signal.addEventListener('abort', () => { streamClosed = true })

      try {
        // Merge universal accessory IDs into the upload batch (deduplicated)
        const accessoryIds: (number | string)[] =
          cfg.source === 'srs' ? ACCESSORY_PRODUCT_IDS :
          cfg.source === 'abc' ? ABC_ACCESSORY_PRODUCT_IDS :
          QXO_ACCESSORY_PRODUCT_KEYS
        const seen = new Set<string>()
        const allProductIds: (number | string)[] = []
        for (const id of [...accessoryIds, ...productIds]) {
          const k = String(id)
          if (seen.has(k)) continue
          seen.add(k)
          allProductIds.push(id)
        }

        // Fetch products + variants — branch by catalog source. We materialize
        // both into the `SrsProduct` shape (the builder is agnostic about
        // origin); QXO products map brand_norm → manufacturer_norm,
        // category_norm → product_category, product_key → product_id (as int
        // if possible — Zuper accepts strings via the cast in builder).
        const allProducts: SrsProduct[] = []
        const allVariants: SrsVariant[] = []
        const PAGE = 1000

        if (cfg.source === 'srs') {
          const ids = allProductIds.map(Number)
          for (let from = 0; from < ids.length; from += PAGE) {
            const chunk = ids.slice(from, from + PAGE)
            const { data, error } = await supabase
              .from('srs_products')
              .select('product_id, product_name, product_category, manufacturer, manufacturer_norm, product_description, product_uom, product_image_url, suggested_price, purchase_price, proposal_line_item, family_tier')
              .in('product_id', chunk)
            if (error) throw new Error(error.message)
            allProducts.push(...(data as SrsProduct[]))
          }
          for (let from = 0; from < ids.length; from += 500) {
            const chunk = ids.slice(from, from + 500)
            const { data, error } = await supabase
              .from('srs_variants')
              .select('variant_id, product_id, variant_code, color_name, size_name, variant_image_url, is_restricted')
              .in('product_id', chunk)
              .eq('is_restricted', false)
            if (error) throw new Error(error.message)
            allVariants.push(...(data as SrsVariant[]))
          }
        } else if (cfg.source === 'abc') {
          // ABC — family_ids are TEXT (e.g. "PFam_3359303"). Keep as strings for
          // the .in() filter, but strip non-digits when stamping into SrsProduct
          // since downstream code groups variants by numeric product_id.
          const keys = allProductIds.map(String)
          // Map original PFam_xxx → digit-only numeric so variants group correctly
          const toNum = (s: string) => Number(s.replace(/\D/g, '')) || 0
          for (let from = 0; from < keys.length; from += PAGE) {
            const chunk = keys.slice(from, from + PAGE)
            const { data, error } = await supabase
              .from('abc_products')
              .select('product_id, product_name, product_category, manufacturer_norm, product_description, product_uom, product_image_url, suggested_price, proposal_line_item, family_tier')
              .in('product_id', chunk)
            if (error) throw new Error(error.message)
            for (const r of (data ?? []) as Array<Record<string, unknown>>) {
              const rawId = String(r.product_id)
              allProducts.push({
                product_id:          toNum(rawId),
                product_name:        (r.product_name as string | null) ?? '',
                // Null/empty ABC product_category routes to "OTHER" — validate
                // creates the Zuper category, categoryMap['OTHER'] resolves.
                product_category:    ((r.product_category as string) || 'OTHER'),
                manufacturer:        (r.manufacturer_norm as string) ?? null,
                manufacturer_norm:   (r.manufacturer_norm as string) ?? null,
                product_description: (r.product_description as string) ?? null,
                product_uom:         (r.product_uom as string | string[] | null) ?? null,
                product_image_url:   (r.product_image_url as string) ?? null,
                suggested_price:     r.suggested_price as number | null,
                purchase_price:      null,
                proposal_line_item:  r.proposal_line_item as string | null,
                family_tier:         r.family_tier as string | null,
              })
            }
          }
          // ABC variants — fetch by product_id (family_id text), map item_number → variant_code.
          for (let from = 0; from < keys.length; from += 500) {
            const chunk = keys.slice(from, from + 500)
            const { data, error } = await supabase
              .from('abc_variants')
              .select('variant_id, product_id, variant_code, color_name, size_name, variant_image_url, is_restricted')
              .in('product_id', chunk)
              .eq('is_restricted', false)
            if (error) throw new Error(error.message)
            for (const r of (data ?? []) as Array<Record<string, unknown>>) {
              allVariants.push({
                variant_id:        toNum(String(r.variant_id)),
                product_id:        toNum(String(r.product_id)),
                variant_code:      (r.variant_code as string) ?? null,
                color_name:        (r.color_name as string) ?? null,
                size_name:         (r.size_name as string) ?? null,
                variant_image_url: (r.variant_image_url as string) ?? null,
                is_restricted:     false,
              })
            }
          }
        } else {
          // QXO — keys are TEXT (e.g. "C-412281"). Map rows into SrsProduct.
          const keys = allProductIds.map(String)
          for (let from = 0; from < keys.length; from += PAGE) {
            const chunk = keys.slice(from, from + PAGE)
            const { data, error } = await supabase
              .from('qxo_products')
              .select('product_key, product_name, category_norm, brand_raw, brand_norm, description_short, suggested_price, proposal_line_item, family_tier, product_image_url:brand_image_url')
              .in('product_key', chunk)
            if (error) throw new Error(error.message)
            for (const r of (data ?? []) as Array<Record<string, unknown>>) {
              allProducts.push({
                // Cast to number for type compat. Downstream we always String()
                // before sending to Zuper, so the lossy cast is intentional.
                product_id:        Number(String(r.product_key).replace(/\D/g, '')) || 0,
                product_name:      r.product_name as string,
                product_category:  (r.category_norm as string) ?? '',
                manufacturer:      (r.brand_raw as string) ?? null,
                manufacturer_norm: (r.brand_norm as string) ?? null,
                product_description: (r.description_short as string) ?? null,
                product_uom:       null,                 // QXO has per-variant UOM only
                product_image_url: (r.product_image_url as string) ?? null,
                suggested_price:   r.suggested_price as number | null,
                purchase_price:    null,
                proposal_line_item: r.proposal_line_item as string | null,
                family_tier:       r.family_tier as string | null,
              })
            }
          }
          // QXO variants — map variant_sku → variant_code (as string), color → color_name.
          for (let from = 0; from < keys.length; from += 500) {
            const chunk = keys.slice(from, from + 500)
            const { data, error } = await supabase
              .from('qxo_variants')
              .select('variant_sku, product_key, color, uom, image_url')
              .in('product_key', chunk)
            if (error) throw new Error(error.message)
            for (const r of (data ?? []) as Array<Record<string, unknown>>) {
              allVariants.push({
                variant_id:        Number(r.variant_sku),
                product_id:        Number(String(r.product_key).replace(/\D/g, '')) || 0,
                variant_code:      String(r.variant_sku),
                color_name:        (r.color as string) ?? null,
                size_name:         (r.uom as string) ?? null,    // size column unused for QXO; carry UOM here for vendor catalog
                variant_image_url: (r.image_url as string) ?? null,
                is_restricted:     false,
              })
            }
          }
        }

        // ── Filter out products with no usable name (incomplete ingest noise) ─
        // These show up as ": Product Name is Mandatory" failures in Zuper. We
        // count them toward `skipped` so CSMs see the number and don't think
        // products silently vanished.
        const skippedNoName = allProducts.filter(p => !p.product_name?.trim()).length
        if (skippedNoName > 0) {
          const usable = allProducts.filter(p => p.product_name?.trim())
          allProducts.length = 0
          allProducts.push(...usable)
          emit({ type: 'skip', count: skippedNoName, reason: 'empty product_name' })
        }

        // ── Pricing fallback — built from the same catalog being uploaded ─
        const priceFallback: PriceFallback = { byCategoryTier: {}, byCategory: {} }
        try {
          const PAGE_PRICE = 1000
          const priced: { product_category: string; family_tier: string | null; suggested_price: number }[] = []
          let pfFrom = 0
          while (!streamClosed) {
            let q: any
            if (cfg.source === 'srs') {
              q = supabase.from('srs_products')
                .select('product_category, family_tier, suggested_price')
                .not('suggested_price', 'is', null)
                .gt('suggested_price', 0)
                .range(pfFrom, pfFrom + PAGE_PRICE - 1)
            } else if (cfg.source === 'abc') {
              // ABC view exposes product_category directly (same name as SRS).
              q = supabase.from('abc_products')
                .select('product_category, family_tier, suggested_price')
                .not('suggested_price', 'is', null)
                .gt('suggested_price', 0)
                .range(pfFrom, pfFrom + PAGE_PRICE - 1)
            } else {
              q = supabase.from('qxo_products')
                .select('product_category:category_norm, family_tier, suggested_price')
                .not('suggested_price', 'is', null)
                .gt('suggested_price', 0)
                .range(pfFrom, pfFrom + PAGE_PRICE - 1)
            }
            const { data, error } = await q
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

        const variantCodeByColor = new Map<number, Map<string, string>>()
        for (const v of allVariants) {
          if (!v.variant_code || !v.color_name) continue
          if (!variantCodeByColor.has(v.product_id)) variantCodeByColor.set(v.product_id, new Map())
          variantCodeByColor.get(v.product_id)!.set(v.color_name.trim(), v.variant_code)
        }

        let uploaded = 0
        let updated = 0
        const errors: { productId: number | string; productName: string; message: string }[] = []
        const productIdMap: Record<string, string> = {}
        const colorCatalogMap: Record<string, Array<{ color_name: string; variant_code: string; option_uid: string; purchase_price: number | null }>> = {}
        const batches = chunks(allProducts, 100)

        // ── Idempotency: fetch existing Zuper products + map by stamped product_id
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
          emit({ type: 'idempotency_scan', existingCount: 0, warning: `Existing-product scan failed: ${(e as Error).message}. Re-uploads may create duplicates.` })
        }

        for (const [i, batch] of Array.from(batches.entries())) {
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
                  needGet.push({ srsId: product.product_id, zuperUid, product })
                } else if (productVariants.some(v => v.variant_code)) {
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

        // ── Phase 2: Upload services (same for both catalogs) ─────────────────
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

        emit({ type: 'done', uploaded, updated, skipped: skippedNoName, errors, productIdMap, serviceIdMap, colorCatalogMap, servicesUploaded, serviceErrors })
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
