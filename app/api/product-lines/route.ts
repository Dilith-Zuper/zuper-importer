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

    if (!selectedBrands || selectedBrands.length === 0) {
      return NextResponse.json({})
    }

    // Single batch query for all brands — then group in JS
    let query = supabase
      .from('srs_products')
      .select('manufacturer_norm, product_line')
      .in('manufacturer_norm', selectedBrands)
      .eq('exclude_default', false)
      .not('product_line', 'is', null)
      .limit(50000)

    if (trade !== 'roofing' && TRADE_CATEGORY[trade]) {
      query = query.eq('product_category', TRADE_CATEGORY[trade])
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

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
