import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { mapWithLimit } from '@/lib/limit'
import {
  catalogConfig, getStockedProductKeys,
  SRS_TRADE_CATEGORY, QXO_TRADE_CATEGORIES,
} from '@/lib/catalog-source'
import type { CatalogSource } from '@/types/wizard'

const PAGE_FANOUT_LIMIT = 5

export async function POST(req: NextRequest) {
  try {
    const {
      selectedBrands,
      trade = 'roofing',
      catalogSource = 'srs',
      branchNum,
    } = await req.json() as {
      selectedBrands: string[]
      trade?: string
      catalogSource?: CatalogSource
      branchNum?: number
    }

    if (!selectedBrands || selectedBrands.length === 0) {
      return NextResponse.json({})
    }
    if (catalogSource === 'qxo' && branchNum == null) {
      return NextResponse.json({ error: 'QXO requires branchNum' }, { status: 400 })
    }

    const cfg = catalogConfig(catalogSource)
    const PAGE = 1000

    // For QXO: stock-filter set of product_keys for this branch.
    let stockedProductKeys: string[] | null = null
    if (cfg.source === 'qxo') {
      const set = await getStockedProductKeys(supabase, branchNum!)
      stockedProductKeys = [...set]
      if (stockedProductKeys.length === 0) return NextResponse.json({})
    }

    // ── Build base query ────────────────────────────────────────────────────
    const buildBase = () => {
      let q: any = supabase
        .from(cfg.tables.products)
        .select(`${cfg.cols.brand}, product_line`, { count: 'exact' })
        .in(cfg.cols.brand, selectedBrands)
        .eq('exclude_default', false)
        .not('product_line', 'is', null)
      if (cfg.source === 'qxo') q = q.eq('is_stocked_anywhere', true)

      if (trade === 'gutters' || trade === 'siding') {
        if (cfg.source === 'srs') {
          q = q.eq(cfg.cols.category, SRS_TRADE_CATEGORY[trade])
        } else {
          q = q.in(cfg.cols.category, QXO_TRADE_CATEGORIES[trade])
        }
      }
      return q
    }

    // ── Helper: paginate one query (with optional product_key chunk filter) ─
    const fetchAllPages = async (keys: string[] | null) => {
      const withKeys = (q: any) => keys ? q.in('product_key', keys) : q

      const { data: first, error, count: total } = await withKeys(buildBase()).range(0, PAGE - 1)
      if (error) throw new Error(error.message)

      const pages: Array<Record<string, string>[]> = [first ?? []]
      if (total && total > PAGE) {
        const pageCount = Math.ceil((total - PAGE) / PAGE)
        const rest = await mapWithLimit<number, Record<string, string>[]>(
          Array.from({ length: pageCount }, (_, i) => i),
          PAGE_FANOUT_LIMIT,
          (i) => withKeys(buildBase())
            .range((i + 1) * PAGE, (i + 2) * PAGE - 1)
            .then((r: any) => (r.data ?? []) as Record<string, string>[]),
        )
        pages.push(...rest)
      }
      return pages.flat()
    }

    // ── Aggregate (chunked for QXO if needed) ───────────────────────────────
    const grouped: Record<string, Record<string, number>> = {}
    const acc = (rows: Record<string, string>[]) => {
      for (const row of rows) {
        const brand = row[cfg.cols.brand]
        const line  = row.product_line
        if (!brand || !line) continue
        if (!grouped[brand]) grouped[brand] = {}
        grouped[brand][line] = (grouped[brand][line] ?? 0) + 1
      }
    }

    if (stockedProductKeys && stockedProductKeys.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < stockedProductKeys.length; i += CHUNK) {
        const chunk = stockedProductKeys.slice(i, i + CHUNK)
        acc(await fetchAllPages(chunk))
      }
    } else {
      acc(await fetchAllPages(null))
    }

    const result: Record<string, { line: string; count: number }[]> = {}
    for (const brand of selectedBrands) {
      result[brand] = Object.entries(grouped[brand] ?? {})
        .map(([line, count]) => ({ line, count }))
        .sort((a, b) => b.count - a.count)
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
