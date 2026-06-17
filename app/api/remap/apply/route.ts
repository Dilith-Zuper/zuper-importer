import { NextRequest } from 'next/server'
import { fetchWithRetry, zuperHeaders } from '@/lib/zuper-fetch'
import { fetchSrsVariants } from '@/lib/srs-variants'
import { buildOptionBlock, type SrsVariant } from '@/lib/product-builder'
import { mapWithLimit } from '@/lib/limit'
import type { RemapSelection } from '@/types/wizard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const APPLY_CONCURRENCY = 6

export async function POST(req: NextRequest) {
  const { baseUrl, apiKey, selections } = await req.json() as {
    baseUrl: string
    apiKey: string
    selections: RemapSelection[]
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false
      const emit = (data: object) => {
        if (streamClosed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) }
        catch { streamClosed = true }
      }
      req.signal.addEventListener('abort', () => { streamClosed = true })

      try {
        if (!Array.isArray(selections) || selections.length === 0) {
          emit({ type: 'done', updated: 0, failed: 0, errors: [] })
          controller.close()
          return
        }

        // Fetch every selected SRS product's variants in one batched call, then
        // group so each PUT just reads its slice.
        const srsIds = [...new Set(selections.map(s => s.srsId))]
        const variants = await fetchSrsVariants(srsIds)
        const variantsByPid = new Map<number, SrsVariant[]>()
        for (const v of variants) {
          const arr = variantsByPid.get(v.product_id) ?? []
          arr.push(v)
          variantsByPid.set(v.product_id, arr)
        }

        emit({ type: 'start', total: selections.length })

        let updated = 0
        let failed = 0
        const errors: { zuperUid: string; productName: string; message: string }[] = []

        await mapWithLimit(selections, APPLY_CONCURRENCY, async (sel) => {
          if (streamClosed) return
          const option = buildOptionBlock(variantsByPid.get(sel.srsId) ?? [], sel.srsCategory)
          let productName = sel.zuperUid
          try {
            // GET the existing product so we only swap the option block —
            // name/price/category/description and all other fields are preserved.
            const getRes = await fetchWithRetry(`${baseUrl}product/${sel.zuperUid}`, {
              headers: zuperHeaders(apiKey),
            })
            const existing = Array.isArray(getRes.json?.data) ? getRes.json.data[0] : getRes.json?.data
            if (!existing) throw new Error('Product not found in Zuper')
            productName = existing.product_name ?? productName

            const payload = {
              product: { ...existing, product_uid: sel.zuperUid, option },
            }
            const putRes = await fetchWithRetry(`${baseUrl}product/${sel.zuperUid}`, {
              method: 'PUT',
              headers: zuperHeaders(apiKey),
              body: JSON.stringify(payload),
            })
            if (putRes.ok && (putRes.json?.type === 'success' || putRes.json?.data)) {
              updated++
              emit({ type: 'progress', status: 'updated', productName, updated, failed, total: selections.length })
            } else {
              const msg = putRes.json?.message ?? JSON.stringify(putRes.json)
              failed++
              errors.push({ zuperUid: sel.zuperUid, productName, message: msg })
              emit({ type: 'progress', status: 'error', productName, message: msg, updated, failed, total: selections.length })
            }
          } catch (e: unknown) {
            const msg = (e as Error).message
            failed++
            errors.push({ zuperUid: sel.zuperUid, productName, message: msg })
            emit({ type: 'progress', status: 'error', productName, message: msg, updated, failed, total: selections.length })
          }
        })

        emit({ type: 'done', updated, failed, errors })
        controller.close()
      } catch (e: unknown) {
        emit({ type: 'done', error: (e as Error).message, updated: 0, failed: 0, errors: [] })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
