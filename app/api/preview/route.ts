import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CATEGORY_NORM } from '@/lib/category-norm'

const GUTTER_CATEGORY = 'GUTTER/ALUMINUM/COIL'
const SIDING_CATEGORY = 'SIDING'

export async function POST(req: NextRequest) {
  try {
    const {
      selectedBrands, selectedProductLines,
      selectedTrades = ['roofing'],
      selectedGutterBrands = [], selectedGutterProductLines = {},
      selectedSidingBrands  = [], selectedSidingProductLines  = {},
    } = await req.json() as {
      selectedBrands: string[]
      selectedProductLines: Record<string, string[]>
      selectedTrades?: string[]
      selectedGutterBrands?: string[]
      selectedGutterProductLines?: Record<string, string[]>
      selectedSidingBrands?: string[]
      selectedSidingProductLines?: Record<string, string[]>
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

    // ── Roofing products ──────────────────────────────────────────────────────
    if (selectedTrades.includes('roofing') && selectedBrands.length > 0) {
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
    }

    // ── Gutter products ───────────────────────────────────────────────────────
    if (selectedTrades.includes('gutters') && selectedGutterBrands.length > 0) {
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('srs_products')
          .select('product_id, product_name, product_category, manufacturer_norm, product_line, family_tier, proposal_line_item, suggested_price')
          .or(`manufacturer_norm.in.(${selectedGutterBrands.join(',')}),and(is_universal.eq.true,manufacturer_norm.ilike.%manufacturer varies%)`)
          .eq('product_category', GUTTER_CATEGORY)
          .eq('exclude_default', false)
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        allProducts.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    // ── Siding products ───────────────────────────────────────────────────────
    if (selectedTrades.includes('siding') && selectedSidingBrands.length > 0) {
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('srs_products')
          .select('product_id, product_name, product_category, manufacturer_norm, product_line, family_tier, proposal_line_item, suggested_price')
          .in('manufacturer_norm', selectedSidingBrands)
          .eq('product_category', SIDING_CATEGORY)
          .eq('exclude_default', false)
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        allProducts.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    // ── Deduplicate by product_id ─────────────────────────────────────────────
    const seen = new Set<number>()
    const deduped = allProducts.filter(p => { if (seen.has(p.product_id)) return false; seen.add(p.product_id); return true })

    // ── Filter by selected product lines per trade ────────────────────────────
    const filtered = deduped.filter(p => {
      const isMfgVaries = !p.manufacturer_norm || p.manufacturer_norm.toLowerCase().includes('manufacturer varies')
      if (isMfgVaries) return true

      // Roofing line filter
      if (selectedTrades.includes('roofing') && selectedBrands.includes(p.manufacturer_norm!)) {
        const allowedLines = selectedProductLines[p.manufacturer_norm!]
        return !allowedLines || allowedLines.includes(p.product_line ?? '')
      }
      // Gutter line filter
      if (selectedTrades.includes('gutters') && selectedGutterBrands.includes(p.manufacturer_norm!)) {
        const allowedLines = selectedGutterProductLines[p.manufacturer_norm!]
        return !allowedLines || allowedLines.includes(p.product_line ?? '')
      }
      // Siding line filter
      if (selectedTrades.includes('siding') && selectedSidingBrands.includes(p.manufacturer_norm!)) {
        const allowedLines = selectedSidingProductLines[p.manufacturer_norm!]
        return !allowedLines || allowedLines.includes(p.product_line ?? '')
      }
      return true
    })

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
