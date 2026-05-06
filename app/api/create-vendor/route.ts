import { NextRequest } from 'next/server'
import { fetchWithRetry, zuperHeaders } from '@/lib/zuper-fetch'
import type { ColorCatalogEntry } from '@/types/wizard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SRS_VENDOR = {
  vendor_name:         'SRS Distribution Inc',
  vendor_display_name: 'SRS Distribution Inc',
  vendor_contact_name: 'SRS',
  vendor_email:        'srs@email.com',
  vendor_description:  '',
  tax_identifier:      null,
  vendor_lead_time:    null,
  vendor_contact_no:   { work: '2144914149', mobile: '2144914149' },
  vendor_delivery_method: 'JOB_ADDRESS',
  vendor_address: {
    street: '', city: '', country: '', email: 'srs@email.com',
    phone_number: '2144914149', zip_code: '', state: '',
    geo_cordinates: [0, 0], landmark: '',
  },
  vendor_billing_address: {
    street:       '7440 State Hwy 121, TX 75070',
    city:         'McKinney',
    state:        'Texas',
    country:      'United States',
    zip_code:     '75070',
    email:        'srs@email.com',
    phone_number: '2144914149',
    geo_cordinates: [33.1349079, -96.7079243],
    landmark:     '',
  },
  attachments:       [],
  custom_fields:     [],
  vendor_bank_details: null,
}

export async function POST(req: NextRequest) {
  const {
    baseUrl, apiKey,
    productIdMap,
    colorCatalogMap,
  }: {
    baseUrl: string
    apiKey: string
    productIdMap: Record<string, string>
    colorCatalogMap: Record<string, ColorCatalogEntry[]>
  } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        // Step 1: Fetch payment terms — find "Immediate"
        emit({ type: 'status', message: 'Fetching payment terms…' })
        const ptRes = await fetchWithRetry(`${baseUrl}invoices/payment_terms`, {
          headers: zuperHeaders(apiKey),
        })
        const terms: Array<{ payment_term_uid: string; payment_term_name: string }> =
          ptRes.json?.data ?? []
        const immediateTerm = terms.find(t =>
          t.payment_term_name?.toLowerCase() === 'immediate'
        ) ?? terms[0]
        const paymentTermUid = immediateTerm?.payment_term_uid ?? null

        emit({ type: 'status', message: 'Creating SRS vendor…' })

        // Step 2: Build vendor_catalog from colorCatalogMap + productIdMap
        const vendorCatalog: Array<{
          product: string
          vendor_sku: string
          vendor_cost: number
          remarks: string
          options?: Array<{ option_uid: string }>
        }> = []

        for (const [srsId, entries] of Object.entries(colorCatalogMap)) {
          const zuperUid = productIdMap[srsId]
          if (!zuperUid) continue

          for (const entry of entries) {
            const catalogItem: (typeof vendorCatalog)[0] = {
              product:     zuperUid,
              vendor_sku:  entry.variant_code || srsId,
              vendor_cost: entry.purchase_price ?? 0,
              remarks:     '',
            }
            if (entry.option_uid) {
              catalogItem.options = [{ option_uid: entry.option_uid }]
            }
            vendorCatalog.push(catalogItem)
          }
        }

        // Products in productIdMap but not in colorCatalogMap (no variants)
        for (const [srsId, zuperUid] of Object.entries(productIdMap)) {
          if (colorCatalogMap[srsId]) continue
          vendorCatalog.push({
            product:     zuperUid,
            vendor_sku:  srsId,
            vendor_cost: 0,
            remarks:     '',
          })
        }

        emit({ type: 'status', message: `Creating vendor with ${vendorCatalog.length} catalog entries…` })

        // Step 3: POST vendor
        const vendorRes = await fetchWithRetry(`${baseUrl}vendors`, {
          method: 'POST',
          headers: zuperHeaders(apiKey),
          body: JSON.stringify({
            vendor: {
              ...SRS_VENDOR,
              accounts: { payment_term: paymentTermUid, tax_group: null },
            },
            vendor_catalog: vendorCatalog,
          }),
        })

        if (!vendorRes.ok) {
          const msg = vendorRes.json?.message ?? JSON.stringify(vendorRes.json)
          emit({ type: 'error', message: `Vendor creation failed: ${msg}` })
          controller.close()
          return
        }

        const vendorUid = vendorRes.json?.data?.vendor_uid ?? ''
        emit({ type: 'done', vendorUid, catalogEntries: vendorCatalog.length })
        controller.close()
      } catch (e: unknown) {
        emit({ type: 'error', message: (e as Error).message })
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
