import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchAllZuperProducts } from '@/lib/zuper-products'
import { fetchSrsVariants } from '@/lib/srs-variants'
import {
  prepareCatalog, matchProduct, isNonMaterial, cleanForDisplay,
  type SrsCatalogProduct, type ScoredMatch,
} from '@/lib/srs-match'
import type { SrsVariant } from '@/lib/product-builder'
import type { RemapCandidate, RemapRow } from '@/types/wizard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SCORE_EMIT_EVERY = 25

// Roll up a matched SRS product's options for the review table.
function rollupOptions(
  prod: SrsCatalogProduct,
  variants: SrsVariant[],
): { hasOptions: boolean; colors: string[]; sizes: string[]; optionsPreview: string } {
  const uniq = (arr: (string | null | undefined)[]) =>
    [...new Set(arr.map(s => (s ?? '').trim()).filter(Boolean))]
  const colors = uniq(variants.map(v => v.color_name)).filter(c => c.toUpperCase() !== 'N/A')
  const sizes = uniq(variants.map(v => v.size_name)).filter(s => s.toUpperCase() !== 'N/A')
  const options = Array.isArray(prod.product_options)
    ? uniq(prod.product_options).filter(o => o.toUpperCase() !== 'N/A')
    : []
  const hasOptions = variants.length > 1 || colors.length > 0 || sizes.length > 0 || options.length > 0

  const bits: string[] = []
  if (colors.length) bits.push('Colors: ' + colors.slice(0, 25).join(', '))
  if (sizes.length) bits.push('Sizes: ' + sizes.slice(0, 15).join(', '))
  if (!colors.length && !sizes.length && options.length) bits.push('Options: ' + options.slice(0, 15).join(', '))
  if (!bits.length) bits.push(variants.length > 1 ? `${variants.length} variants` : 'No options (single SKU)')

  return { hasOptions, colors, sizes, optionsPreview: bits.join('  |  ') }
}

export async function POST(req: NextRequest) {
  const { baseUrl, apiKey } = await req.json() as { baseUrl: string; apiKey: string }

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
        // ── 1. Pull existing Zuper products ──────────────────────────────────
        emit({ type: 'phase', phase: 'scan' })
        const zuperProducts = await fetchAllZuperProducts(baseUrl, apiKey, {
          onProgress: (pageNumber, totalPages) => emit({ type: 'scan_progress', pageNumber, totalPages }),
          aborted: () => streamClosed,
        })

        // Drop SERVICE products and labor/fee rows — only material parts get options.
        let excluded = 0
        const candidates = zuperProducts.filter(p => {
          const name = (p.product_name ?? '').trim()
          if (!name) { excluded++; return false }
          if (p.product_type === 'SERVICE') { excluded++; return false }
          if (isNonMaterial(name)) { excluded++; return false }
          return true
        })
        emit({ type: 'scan_done', total: candidates.length, excluded })

        // ── 2. Load the SRS catalog (paginated) ──────────────────────────────
        emit({ type: 'phase', phase: 'catalog' })
        const products: SrsCatalogProduct[] = []
        const PAGE = 1000
        let from = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from('srs_products')
            .select('product_id, product_name, manufacturer_norm, product_category, proposal_line_item, product_options')
            .order('product_id')
            .range(from, from + PAGE - 1)
          if (error) throw new Error(error.message)
          const rows = (data ?? []) as unknown as SrsCatalogProduct[]
          products.push(...rows)
          if (rows.length < PAGE) break
          from += PAGE
          if (streamClosed) return
        }
        const { brandVocab, srsHasBrand } = prepareCatalog(products)
        const srsById = new Map<number, SrsCatalogProduct>()
        for (const p of products) srsById.set(p.product_id, p)
        emit({ type: 'catalog_done', count: products.length })

        // ── 3. Score each candidate against the catalog ──────────────────────
        emit({ type: 'phase', phase: 'score' })
        type Pending = {
          zuperUid: string
          zuperName: string
          zuperProductId: string | null
          confidence: RemapRow['confidence']
          fastPath: boolean
          brand: string | null
          cands: ScoredMatch[]   // best..third, fast-path is single
        }
        const pending: Pending[] = []

        for (let i = 0; i < candidates.length; i++) {
          if (streamClosed) return
          const p = candidates[i]
          const zuperUid = String(p.product_uid ?? '')
          const zuperName = String(p.product_name ?? '')
          const stampedId = p.product_id != null ? String(p.product_id) : null

          // Fast path — product already carries an SRS product_id (prior import).
          const stampedNum = stampedId && /^\d+$/.test(stampedId) ? Number(stampedId) : NaN
          const fastHit = Number.isFinite(stampedNum) ? srsById.get(stampedNum) : undefined
          if (fastHit) {
            pending.push({
              zuperUid, zuperName, zuperProductId: stampedId,
              confidence: 'exact', fastPath: true, brand: fastHit.brandLc ?? null,
              cands: [{ prod: fastHit, score: 1 }],
            })
          } else {
            const m = matchProduct({ name: zuperName }, products, brandVocab, srsHasBrand)
            const cands = [m.best, m.second, m.third].filter((c): c is ScoredMatch => !!c && !!c.prod)
            pending.push({
              zuperUid, zuperName, zuperProductId: stampedId,
              confidence: m.confidence, fastPath: false, brand: m.aBrand,
              cands,
            })
          }
          if ((i + 1) % SCORE_EMIT_EVERY === 0 || i === candidates.length - 1) {
            emit({ type: 'score_progress', scored: i + 1, total: candidates.length })
          }
        }

        // ── 4. Fetch variants for every candidate SRS product, roll up options ─
        emit({ type: 'phase', phase: 'options' })
        const allSrsIds = new Set<number>()
        for (const row of pending) for (const c of row.cands) allSrsIds.add(c.prod.product_id)
        const variants = await fetchSrsVariants([...allSrsIds])
        const variantsByPid = new Map<number, SrsVariant[]>()
        for (const v of variants) {
          const arr = variantsByPid.get(v.product_id) ?? []
          arr.push(v)
          variantsByPid.set(v.product_id, arr)
        }

        const toCandidate = (m: ScoredMatch): RemapCandidate => {
          const prod = m.prod
          const roll = rollupOptions(prod, variantsByPid.get(prod.product_id) ?? [])
          return {
            srsId: prod.product_id,
            srsName: cleanForDisplay(prod.product_name),
            srsCategory: prod.product_category ?? '',
            srsBrand: prod.manufacturer_norm ?? '',
            score: Number(m.score.toFixed(3)),
            ...roll,
          }
        }

        const rows: RemapRow[] = pending.map(row => ({
          zuperUid: row.zuperUid,
          zuperName: row.zuperName,
          zuperProductId: row.zuperProductId,
          confidence: row.confidence,
          fastPath: row.fastPath,
          brand: row.brand,
          candidates: row.cands.map(toCandidate),
        }))

        // Sort exact → strong → weak → none, then by name for a stable table.
        const rank: Record<RemapRow['confidence'], number> = { exact: 0, strong: 1, weak: 2, none: 3 }
        rows.sort((a, b) => (rank[a.confidence] - rank[b.confidence]) || a.zuperName.localeCompare(b.zuperName))

        const tally = { exact: 0, strong: 0, weak: 0, none: 0 }
        for (const r of rows) tally[r.confidence]++

        emit({ type: 'done', rows, excluded, tally })
        controller.close()
      } catch (e: unknown) {
        emit({ type: 'done', error: (e as Error).message, rows: [] })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
