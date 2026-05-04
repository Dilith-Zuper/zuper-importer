import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

    const result: Record<string, { line: string; count: number }[]> = {}

    for (const brand of selectedBrands) {
      const counts: Record<string, number> = {}
      let from = 0
      const PAGE = 1000

      while (true) {
        let query = supabase
          .from('srs_products')
          .select('product_line')
          .eq('manufacturer_norm', brand)
          .eq('exclude_default', false)

        // For gutters/siding, also filter to that category
        if (trade !== 'roofing' && TRADE_CATEGORY[trade]) {
          query = query.eq('product_category', TRADE_CATEGORY[trade])
        }

        const { data, error } = await query.range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)

        for (const row of data) {
          const line = row.product_line as string
          if (line) counts[line] = (counts[line] ?? 0) + 1
        }

        if (data.length < PAGE) break
        from += PAGE
      }

      result[brand] = Object.entries(counts)
        .map(([line, count]) => ({ line, count }))
        .sort((a, b) => b.count - a.count)
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
