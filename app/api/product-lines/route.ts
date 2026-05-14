import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { mapWithLimit } from '@/lib/limit'

const PAGE_FANOUT_LIMIT = 5

const TRADE_CATEGORY: Record<string, string> = {
  gutters: 'GUTTER/ALUMINUM/COIL',
  siding:  'SIDING',
}

export async function POST(req: NextRequest) {
  try {
    const { selectedBrands, trade = 'roofing' } = await req.json() as {
      selectedBrands: string[]
      trade?: string
    }

    if (!selectedBrands || selectedBrands.length === 0) {
      return NextResponse.json({})
    }

    const PAGE = 1000
    const baseFilters = (q: ReturnType<typeof supabase.from>) =>
      (q as any)
        .select('manufacturer_norm, product_line', { count: 'exact' })
        .in('manufacturer_norm', selectedBrands)
        .eq('exclude_default', false)
        .not('product_line', 'is', null)

    const categoryFilter = trade !== 'roofing' && TRADE_CATEGORY[trade]
      ? (q: any) => q.eq('product_category', TRADE_CATEGORY[trade])
      : (q: any) => q

    const applyFilters = (q: any) => categoryFilter(baseFilters(q))

    // Paginate in parallel — Supabase caps each request at 1000 rows
    const { data: firstPage, error, count: total } = await applyFilters(
      supabase.from('srs_products')
    ).range(0, PAGE - 1)
    if (error) throw new Error(error.message)

    const pages: Array<{ manufacturer_norm: string; product_line: string }[]> = [firstPage ?? []]
    if (total && total > PAGE) {
      const pageCount = Math.ceil((total - PAGE) / PAGE)
      const rest = await mapWithLimit<number, { manufacturer_norm: string; product_line: string }[]>(
        Array.from({ length: pageCount }, (_, i) => i),
        PAGE_FANOUT_LIMIT,
        (i) =>
          applyFilters(supabase.from('srs_products'))
            .range((i + 1) * PAGE, (i + 2) * PAGE - 1)
            .then((r: any) => r.data ?? [])
      )
      pages.push(...rest)
    }

    const data = pages.flat()

    // Group by brand → product line with counts
    const grouped: Record<string, Record<string, number>> = {}
    for (const row of data) {
      const brand = row.manufacturer_norm as string
      const line  = row.product_line as string
      if (!grouped[brand]) grouped[brand] = {}
      grouped[brand][line] = (grouped[brand][line] ?? 0) + 1
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
