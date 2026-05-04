import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const TOP_SECONDARY = ['Iko', 'Malarkey', 'Tamko', 'Atlas', 'Boral', 'Decra']

const TRADE_CATEGORY: Record<string, string> = {
  gutters: 'GUTTER/ALUMINUM/COIL',
  siding:  'SIDING',
}

export async function POST(req: NextRequest) {
  try {
    const { trade = 'roofing' } = await req.json() as { trade?: string }

    // ── Gutters / Siding ── simple brand list by product count ──────────────
    if (trade === 'gutters' || trade === 'siding') {
      const category = TRADE_CATEGORY[trade]
      const counts: Record<string, number> = {}
      let from = 0
      const PAGE = 1000
      while (true) {
        const { data, error } = await supabase
          .from('srs_products')
          .select('manufacturer_norm')
          .eq('product_category', category)
          .eq('exclude_default', false)
          .not('manufacturer_norm', 'is', null)
          .not('manufacturer_norm', 'ilike', '%manufacturer varies%')
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        for (const row of data) {
          const b = row.manufacturer_norm as string
          counts[b] = (counts[b] ?? 0) + 1
        }
        if (data.length < PAGE) break
        from += PAGE
      }
      const brands = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
      return NextResponse.json({ brands })
    }

    // ── Roofing ── existing Big3 + secondary structure ──────────────────────
    const counts: Record<string, number> = {}
    const big3Flag: Record<string, boolean> = {}
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data, error } = await supabase
        .from('srs_products')
        .select('manufacturer_norm, is_big3_brand')
        .eq('exclude_default', false)
        .not('manufacturer_norm', 'is', null)
        .not('manufacturer_norm', 'ilike', '%manufacturer varies%')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const row of data) {
        const b = row.manufacturer_norm as string
        counts[b] = (counts[b] ?? 0) + 1
        if (row.is_big3_brand) big3Flag[b] = true
      }
      if (data.length < PAGE) break
      from += PAGE
    }

    const allBrands = Object.entries(counts)
      .map(([name, count]) => ({ name, count, isBig3: big3Flag[name] ?? false }))
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

// Keep GET for backwards compatibility (roofing default)
export async function GET() {
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ trade: 'roofing' }) }) as NextRequest)
}
