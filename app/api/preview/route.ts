import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CATEGORY_NORM } from '@/lib/category-norm'

export async function POST(req: NextRequest) {
  try {
    const { selectedBrands, selectedProductLines } = await req.json() as {
      selectedBrands: string[]
      selectedProductLines: Record<string, string[]>
    }

    const allProducts: {
      product_id: number
      product_name: string
      product_category: string
      manufacturer_norm: string | null
      product_line: string | null
      family_tier: string | null
      proposal_line_item: string | null
      suggested_price: number | null
    }[] = []

    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, manufacturer_norm, product_line, family_tier, proposal_line_item, suggested_price')
        .or(`manufacturer_norm.in.(${selectedBrands.join(',')}),and(is_universal.eq.true,manufacturer_norm.ilike.%manufacturer varies%)`)
        .eq('exclude_default', false)
        .order('proposal_line_item', { nullsFirst: false })
        .order('product_name')
        .range(from, from + PAGE - 1)

      if (error) throw new Error(error.message)
      allProducts.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }

    // Filter by selected product_line per brand
    const hasLineFilter = Object.keys(selectedProductLines).length > 0
    const filtered = hasLineFilter ? allProducts.filter(p => {
      const isMfgVaries = !p.manufacturer_norm || p.manufacturer_norm.toLowerCase().includes('manufacturer varies')
      if (isMfgVaries) return true

      const allowedLines = selectedProductLines[p.manufacturer_norm!]
      if (!allowedLines) return true

      return allowedLines.includes(p.product_line ?? '')
    }) : allProducts

    const byCategory: Record<string, number> = {}
    for (const p of filtered) {
      const key = p.proposal_line_item ?? CATEGORY_NORM[p.product_category] ?? p.product_category ?? 'Other'
      byCategory[key] = (byCategory[key] ?? 0) + 1
    }

    return NextResponse.json({
      products: filtered,
      productIds: filtered.map(p => p.product_id),
      counts: { total: filtered.length, byCategory },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
