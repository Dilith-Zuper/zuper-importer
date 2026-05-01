import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { selectedBrands } = await req.json() as { selectedBrands: string[] }

    const allProducts: {
      product_id: number
      product_name: string
      product_category: string
      manufacturer_norm: string | null
      family_tier: string | null
      proposal_line_item: string | null
      suggested_price: number | null
    }[] = []

    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, manufacturer_norm, family_tier, proposal_line_item, suggested_price')
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

    const CATEGORY_NORM: Record<string, string> = {
      'SHINGLES': 'Shingles', 'HIP AND RIDGE': 'Hip & Ridge Cap', 'STARTER': 'Starter Strip',
      'UNDERLAYMENT': 'Underlayment — Synthetic', 'ICE AND WATER': 'Ice & Water — Standard',
      'VENTS': 'Box Vent', 'OTHER FASTENERS': 'Fasteners', 'COIL NAILS': 'Coil Nails',
      'DECKING': 'Roof Decking (OSB)', 'DRIP EDGE': 'Drip Edge',
      'OTHER FLASHING METAL': 'Step Flashing', 'PIPE FLASHING': 'Pipe Boot 3"',
      'CAULK': 'Caulk / Sealant', 'SPRAY PAINT': 'Spray Paint',
      'COMMERCIAL': 'Commercial Membrane (TPO/EPDM)', 'SIDING': 'Siding',
      'GUTTER/ALUMINUM/COIL': 'Gutter Sections', 'TOOLS/SAFETY': 'TOOLS/SAFETY', 'OTHER': 'OTHER',
    }
    const byCategory: Record<string, number> = {}
    for (const p of allProducts) {
      const key = p.proposal_line_item ?? CATEGORY_NORM[p.product_category] ?? p.product_category ?? 'Other'
      byCategory[key] = (byCategory[key] ?? 0) + 1
    }

    return NextResponse.json({
      products: allProducts,
      productIds: allProducts.map(p => p.product_id),
      counts: { total: allProducts.length, byCategory },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
