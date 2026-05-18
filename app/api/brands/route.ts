import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { mapWithLimit } from '@/lib/limit'
import {
  catalogConfig, getStockedProductKeys,
  QXO_BIG3, SRS_TRADE_CATEGORY, QXO_TRADE_CATEGORIES,
} from '@/lib/catalog-source'
import type { CatalogSource } from '@/types/wizard'

const PAGE_FANOUT_LIMIT = 5
const TOP_SECONDARY = ['Iko', 'Malarkey', 'Tamko', 'Atlas', 'Boral', 'Decra']

export async function POST(req: NextRequest) {
  try {
    const {
      trade = 'roofing',
      catalogSource = 'srs',
      branchNum,
    } = await req.json() as {
      trade?: string
      catalogSource?: CatalogSource
      branchNum?: number
    }

    if (catalogSource === 'qxo' && branchNum == null) {
      return NextResponse.json({ error: 'QXO requires branchNum' }, { status: 400 })
    }

    const cfg = catalogConfig(catalogSource)
    const PAGE = 1000

    // ── For QXO: precompute the set of stocked product_keys for the branch ──
    // Then we filter the brands query by `product_key IN (…)` in chunks.
    let stockedProductKeys: string[] | null = null
    if (cfg.source === 'qxo') {
      const set = await getStockedProductKeys(supabase, branchNum!)
      stockedProductKeys = [...set]
      if (stockedProductKeys.length === 0) {
        // Branch stocks nothing? Return empty result instead of an error so
        // the UI can surface a friendly "no products at this branch" state.
        return trade === 'roofing'
          ? NextResponse.json({ big3: [], topSecondary: [], otherBrands: [] })
          : NextResponse.json({ brands: [] })
      }
    }

    // ── Build base query ────────────────────────────────────────────────────
    // For SRS: filter on enum product_category. For QXO: OR-match free-text
    // category_norm against the trade's category list.
    const buildBaseQuery = () => {
      let q: any = supabase
        .from(cfg.tables.products)
        .select(cfg.cols.brand, { count: 'exact' })
        .eq('exclude_default', false)
        .not(cfg.cols.brand, 'is', null)

      if (cfg.source === 'srs') {
        q = q.not(cfg.cols.brand, 'ilike', '%manufacturer varies%')
      }
      if (cfg.source === 'qxo') {
        q = q.eq('is_stocked_anywhere', true)
      }

      if (trade === 'gutters' || trade === 'siding') {
        if (cfg.source === 'srs') {
          q = q.eq(cfg.cols.category, SRS_TRADE_CATEGORY[trade])
        } else {
          q = q.in(cfg.cols.category, QXO_TRADE_CATEGORIES[trade])
        }
      }
      return q
    }

    // ── Helper: run paginated brand-count for a single chunk of keys ────────
    // For SRS: keys param ignored, single full pass.
    // For QXO: filter on product_key IN chunk.
    const countBrandsForKeyChunk = async (keys: string[] | null) => {
      const baseWithKeys = (q: any) => keys ? q.in('product_key', keys) : q

      const counts: Record<string, number> = {}

      const { data: first, error, count: total } = await baseWithKeys(buildBaseQuery()).range(0, PAGE - 1)
      if (error) throw new Error(error.message)
      for (const row of (first ?? [])) {
        const b = (row as Record<string, string>)[cfg.cols.brand]
        if (b) counts[b] = (counts[b] ?? 0) + 1
      }

      if (total && total > PAGE) {
        const pageCount = Math.ceil((total - PAGE) / PAGE)
        const rest = await mapWithLimit<number, Record<string, string>[]>(
          Array.from({ length: pageCount }, (_, i) => i),
          PAGE_FANOUT_LIMIT,
          (i) => baseWithKeys(buildBaseQuery())
            .range((i + 1) * PAGE, (i + 2) * PAGE - 1)
            .then((r: any) => (r.data ?? []) as Record<string, string>[]),
        )
        for (const page of rest) {
          for (const row of page) {
            const b = row[cfg.cols.brand]
            if (b) counts[b] = (counts[b] ?? 0) + 1
          }
        }
      }

      return counts
    }

    // ── Run query(ies) ──────────────────────────────────────────────────────
    let counts: Record<string, number> = {}
    if (stockedProductKeys && stockedProductKeys.length > 0) {
      // Supabase encodes .in() into the URL — chunk by 500 to stay well under
      // the URL length limit. Merge counts across chunks.
      const CHUNK = 500
      for (let i = 0; i < stockedProductKeys.length; i += CHUNK) {
        const chunk = stockedProductKeys.slice(i, i + CHUNK)
        const partial = await countBrandsForKeyChunk(chunk)
        for (const [b, n] of Object.entries(partial)) {
          counts[b] = (counts[b] ?? 0) + n
        }
      }
    } else {
      counts = await countBrandsForKeyChunk(null)
    }

    // ── Shape response ──────────────────────────────────────────────────────
    if (trade === 'gutters' || trade === 'siding') {
      const brands = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
      return NextResponse.json({ brands })
    }

    // Roofing — group into big3 / topSecondary / otherBrands
    const isBig3 = (name: string) =>
      cfg.source === 'srs'
        ? false  // SRS lookup uses is_big3_brand below
        : QXO_BIG3.has(name)

    // For SRS, fetch is_big3_brand to identify the Big 3 — separate query
    // because the count-grouping pass doesn't include other columns.
    let big3Names = new Set<string>()
    if (cfg.source === 'srs') {
      const { data, error } = await supabase
        .from('srs_products')
        .select('manufacturer_norm')
        .eq('is_big3_brand', true)
        .eq('exclude_default', false)
        .not('manufacturer_norm', 'is', null)
        .limit(1000)
      if (error) throw new Error(error.message)
      for (const r of (data ?? [])) big3Names.add((r as { manufacturer_norm: string }).manufacturer_norm)
    } else {
      big3Names = new Set(QXO_BIG3)
    }

    const allBrands = Object.entries(counts)
      .map(([name, count]) => ({ name, count, isBig3: big3Names.has(name) || isBig3(name) }))
      .sort((a, b) => b.count - a.count)

    const big3      = allBrands.filter(b => b.isBig3)
    const secondary = allBrands.filter(b => !b.isBig3)
    const top9Set   = new Set(TOP_SECONDARY)
    const predefined   = secondary.filter(b => top9Set.has(b.name))
    const remaining    = secondary.filter(b => !top9Set.has(b.name))
    const topSecondary = [...predefined, ...remaining].slice(0, 9)
    const otherBrands  = secondary.filter(b => !topSecondary.find(t => t.name === b.name))

    return NextResponse.json({ big3, topSecondary, otherBrands })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Keep GET for backwards compatibility (roofing default — SRS only)
export async function GET() {
  return POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ trade: 'roofing', catalogSource: 'srs' }),
  }) as NextRequest)
}
