import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchWithRetry, zuperHeaders, chunks, sleep } from '@/lib/zuper-fetch'
import { buildProductPayload, type SrsProduct, type SrsVariant } from '@/lib/product-builder'
import { buildServicePayload } from '@/lib/service-builder'
import { SERVICE_CATALOG } from '@/lib/service-catalog'
import { ACCESSORY_PRODUCT_IDS } from '@/lib/accessory-catalog'

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
      const emit = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

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
            .select('product_id, product_name, product_category, manufacturer, manufacturer_norm, product_description, product_uom, product_image_url, suggested_price, proposal_line_item, family_tier')
            .in('product_id', chunk)
          if (error) throw new Error(error.message)
          allProducts.push(...(data as SrsProduct[]))
        }

        const allVariants: SrsVariant[] = []
        for (let from = 0; from < allProductIds.length; from += 500) {
          const chunk = allProductIds.slice(from, from + 500)
          const { data, error } = await supabase
            .from('srs_variants')
            .select('variant_id, product_id, color_name, size_name, variant_image_url, is_restricted')
            .in('product_id', chunk)
            .eq('is_restricted', false)
          if (error) throw new Error(error.message)
          allVariants.push(...(data as SrsVariant[]))
        }

        // Group variants by product
        const variantsByProduct = new Map<number, SrsVariant[]>()
        for (const v of allVariants) {
          const arr = variantsByProduct.get(v.product_id) ?? []
          arr.push(v)
          variantsByProduct.set(v.product_id, arr)
        }

        let uploaded = 0
        const errors: { productId: number; productName: string; message: string }[] = []
        const productIdMap: Record<string, string> = {}
        const batches = chunks(allProducts, 100)

        for (const [i, batch] of Array.from(batches.entries())) {
          await Promise.allSettled(batch.map(async (product) => {
            const payload = buildProductPayload(
              product,
              variantsByProduct.get(product.product_id) ?? [],
              categoryMap,
              warehouseUid,
              formulaMap,
              productTierFieldUid
            )
            try {
              const r = await fetchWithRetry(`${baseUrl}product`, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify(payload),
              })
              if (r.ok && (r.json?.type === 'success' || r.json?.data)) {
                uploaded++
                const zuperUid = r.json?.data?.product_uid ?? ''
                if (zuperUid) productIdMap[String(product.product_id)] = zuperUid
                emit({ type: 'progress', status: 'success', productName: product.product_name, uploaded, total: allProducts.length })
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

          emit({ type: 'batch_complete', batch: i + 1, of: batches.length, uploaded, errors: errors.length })
          if (i < batches.length - 1) await sleep(3000)
        }

        // ── Phase 2: Upload services ──────────────────────────────────────────
        const servicesToUpload = SERVICE_CATALOG.filter(s =>
          s.trades.some(t => selectedTrades.includes(t)) &&
          serviceCategoryMap[s.category_key]
        )

        let servicesUploaded = 0
        const serviceErrors: { name: string; message: string }[] = []

        if (servicesToUpload.length > 0) {
          emit({ type: 'services_start', total: servicesToUpload.length })

          for (const service of servicesToUpload) {
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
          }
        }

        emit({ type: 'done', uploaded, skipped: 0, errors, productIdMap, servicesUploaded, serviceErrors })
        controller.close()
      } catch (e: unknown) {
        emit({ type: 'done', error: (e as Error).message, uploaded: 0, skipped: 0, errors: [] })
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
