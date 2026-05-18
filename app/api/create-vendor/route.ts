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
        // ── Step 1: Fetch payment terms — find "Immediate" ──────────────────
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

        // ── Step 2: Look up existing SRS vendor by name (paginated) ─────────
        // If found, we POST new catalog entries to /vendors/{uid}/catalog
        // instead of POSTing a duplicate vendor (which Zuper rejects).
        emit({ type: 'status', message: 'Checking for existing SRS vendor…' })
        const wantedName = SRS_VENDOR.vendor_name.trim().toLowerCase()
        let existingVendorUid = ''
        for (let page = 1; page < 100; page++) {
          const r = await fetchWithRetry(`${baseUrl}vendors?count=100&page=${page}`, {
            headers: zuperHeaders(apiKey),
          })
          const rows: Array<{ vendor_uid: string; vendor_name: string }> = r.json?.data ?? []
          const found = rows.find(v => v.vendor_name?.trim().toLowerCase() === wantedName)
          if (found) { existingVendorUid = found.vendor_uid; break }
          if (rows.length < 100) break
        }

        // ── Step 3: If existing, fetch its current catalog to dedupe by product UID
        const existingProductUids = new Set<string>()
        if (existingVendorUid) {
          emit({ type: 'status', message: 'Reading existing vendor catalog…' })
          const r = await fetchWithRetry(`${baseUrl}vendors/${existingVendorUid}`, {
            headers: zuperHeaders(apiKey),
          })
          const catalog: Array<{ product?: string | { product_uid?: string } }> =
            r.json?.data?.vendor_catalog ?? r.json?.data?.catalog ?? []
          for (const entry of catalog) {
            const uid = typeof entry.product === 'string'
              ? entry.product
              : entry.product?.product_uid
            if (uid) existingProductUids.add(uid)
          }
        }

        // ── Step 4: Build vendor_catalog from colorCatalogMap + productIdMap
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

        // ── Step 5: Filter out catalog entries already on the existing vendor
        const newEntries = existingVendorUid
          ? vendorCatalog.filter(e => !existingProductUids.has(e.product))
          : vendorCatalog
        const skipped = vendorCatalog.length - newEntries.length

        // ── Step 6: Create new vendor OR append to existing ─────────────────
        if (!existingVendorUid) {
          emit({ type: 'status', message: `Creating vendor with ${newEntries.length} catalog entries…` })
          const vendorRes = await fetchWithRetry(`${baseUrl}vendors`, {
            method: 'POST',
            headers: zuperHeaders(apiKey),
            body: JSON.stringify({
              vendor: {
                ...SRS_VENDOR,
                accounts: { payment_term: paymentTermUid, tax_group: null },
              },
              vendor_catalog: newEntries,
            }),
          })

          if (!vendorRes.ok) {
            const msg = vendorRes.json?.message ?? JSON.stringify(vendorRes.json)
            emit({ type: 'error', message: `Vendor creation failed: ${msg}` })
            controller.close()
            return
          }

          const vendorUid = vendorRes.json?.data?.vendor_uid ?? ''
          emit({ type: 'done', vendorUid, catalogEntries: newEntries.length, skipped: 0, created: true })
          controller.close()
          return
        }

        // Existing vendor: append catalog entries
        if (newEntries.length === 0) {
          emit({
            type: 'done',
            vendorUid: existingVendorUid,
            catalogEntries: 0,
            skipped,
            created: false,
            message: 'All products already present in existing vendor catalog — nothing to add.',
          })
          controller.close()
          return
        }

        emit({
          type: 'status',
          message: `Found existing SRS vendor. Adding ${newEntries.length} new catalog entries (${skipped} already present)…`,
        })

        const catalogRes = await fetchWithRetry(`${baseUrl}vendors/${existingVendorUid}/catalog`, {
          method: 'POST',
          headers: zuperHeaders(apiKey),
          body: JSON.stringify({ vendor_catalog: newEntries }),
        })

        if (!catalogRes.ok) {
          const msg = catalogRes.json?.message ?? JSON.stringify(catalogRes.json)
          emit({ type: 'error', message: `Catalog append failed: ${msg}` })
          controller.close()
          return
        }

        emit({
          type: 'done',
          vendorUid: existingVendorUid,
          catalogEntries: newEntries.length,
          skipped,
          created: false,
        })
        controller.close()
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? String(e)
        console.error('[create-vendor] top-level error:', msg, e)
        try { emit({ type: 'error', message: msg }) } catch {}
        try { controller.close() } catch {}
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
