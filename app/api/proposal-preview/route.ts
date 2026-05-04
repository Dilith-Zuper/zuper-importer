import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ITEM_TO_FORMULA_KEY } from '@/lib/formula-definitions'
import { normalizeCategory } from '@/lib/category-norm'
import type { ProposalLineItem, BrandPackage } from '@/types/wizard'

const CPQ_CATEGORIES = ['SHINGLES', 'HIP AND RIDGE', 'STARTER', 'UNDERLAYMENT', 'ICE AND WATER', 'VENTS']
const CPQ_COMPONENTS = ['Shingles', 'Hip & Ridge Cap', 'Starter Strip', 'Underlayment — Synthetic', 'Underlayment — Felt 30#', 'Ice & Water — Standard', 'Ice & Water — High Temp', 'Box Vent', 'Ridge Vent']

// Universal accessories — same across Good / Better / Best, drawn from manufacturer-varies products
const UNIVERSAL_CATEGORIES = ['DRIP EDGE', 'COIL NAILS', 'OTHER FASTENERS', 'OTHER FLASHING METAL', 'PIPE FLASHING', 'CAULK']
const UNIVERSAL_COMPONENTS  = [
  'Drip Edge', 'Step Flashing', 'W-Valley', 'Counter / Headwall Flashing',
  'Pipe Boot 3"', 'Coil Nails', 'Plastic Cap Nails', 'Fasteners', 'Caulk / Sealant',
]

function pickProduct(byTier: Record<string, ProposalLineItem[]>, tierPrefs: string[]): ProposalLineItem | null {
  for (const tier of tierPrefs) {
    const items = byTier[tier]
    if (items?.length) return items[0]
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { selectedBrands, selectedProductLines } = await req.json() as {
      selectedBrands: string[]
      selectedProductLines: Record<string, string[]>
    }

    const result: Record<string, BrandPackage> = {}

    for (const brand of selectedBrands) {
      const allowedLines = selectedProductLines[brand] ?? []

      const query = supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item, product_line')
        .eq('manufacturer_norm', brand)
        .eq('exclude_default', false)
        .in('product_category', CPQ_CATEGORIES)

      // Filter to selected product lines if provided
      if (allowedLines.length > 0) {
        query.in('product_line', allowedLines)
      }

      const { data: brandProducts } = await query.limit(500)
      if (!brandProducts?.length) continue

      // Check eligibility: shingles must exist in 2+ tiers (within selected lines)
      const shingleTiers = new Set(
        brandProducts
          .filter(p => p.product_category === 'SHINGLES' || p.proposal_line_item === 'Shingles')
          .map(p => p.family_tier).filter(Boolean)
      )
      if (shingleTiers.size < 2) continue

      // Group by component → tier → items (primary_item first)
      const byCompTier: Record<string, Record<string, ProposalLineItem[]>> = {}
      for (const p of brandProducts) {
        const comp = normalizeCategory(p.proposal_line_item, p.product_category)
        if (!CPQ_COMPONENTS.includes(comp)) continue
        const tier = p.family_tier ?? 'null'
        if (!byCompTier[comp]) byCompTier[comp] = {}
        if (!byCompTier[comp][tier]) byCompTier[comp][tier] = []
        byCompTier[comp][tier].push({
          product_id: p.product_id,
          product_name: p.product_name,
          proposal_line_item: comp,
          formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
          suggested_price: p.suggested_price,
          family_tier: p.family_tier,
        })
        // primary_item floats to front
        if (p.primary_item) {
          const arr = byCompTier[comp][tier]
          const last = arr.pop()!
          arr.unshift(last)
        }
      }

      // Fetch manufacturer-varies universals (drip edge, nails)
      const { data: universals } = await supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item')
        .eq('exclude_default', false).eq('is_universal', true)
        .ilike('manufacturer_norm', '%manufacturer varies%')
        .in('product_category', UNIVERSAL_CATEGORIES)
        .limit(100)

      const universalMap: Record<string, ProposalLineItem> = {}
      for (const p of universals ?? []) {
        const comp = normalizeCategory(p.proposal_line_item, p.product_category)
        if (!UNIVERSAL_COMPONENTS.includes(comp)) continue
        if (!universalMap[comp] || p.primary_item) {
          universalMap[comp] = {
            product_id: p.product_id, product_name: p.product_name,
            proposal_line_item: comp, formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
            suggested_price: p.suggested_price, family_tier: null,
          }
        }
      }

      const buildPackage = (shingleTiers: string[], accessoryTiers: string[]): ProposalLineItem[] => {
        const lines: ProposalLineItem[] = []
        const shingles = pickProduct(byCompTier['Shingles'] ?? {}, shingleTiers)
        if (shingles) lines.push(shingles)
        const hip = pickProduct(byCompTier['Hip & Ridge Cap'] ?? {}, accessoryTiers)
        if (hip) lines.push(hip)
        const starter = pickProduct(byCompTier['Starter Strip'] ?? {}, accessoryTiers)
        if (starter) lines.push(starter)
        // One underlayment
        for (const comp of ['Underlayment — Synthetic', 'Underlayment — Felt 30#']) {
          const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
          if (item) { lines.push(item); break }
        }
        // One ice & water
        for (const comp of ['Ice & Water — Standard', 'Ice & Water — High Temp']) {
          const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
          if (item) { lines.push(item); break }
        }
        // One vent
        for (const comp of ['Box Vent', 'Ridge Vent']) {
          const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
          if (item) { lines.push(item); break }
        }
        // Universals
        for (const comp of UNIVERSAL_COMPONENTS) {
          if (universalMap[comp]) lines.push(universalMap[comp])
        }
        return lines
      }

      result[brand] = {
        good:   buildPackage(['addon', 'good'],          ['addon', 'good', 'better', 'best']),
        better: buildPackage(['good',  'addon'],          ['good',  'addon', 'better', 'best']),
        best:   buildPackage(['best',  'better', 'good'], ['best',  'good',  'addon',  'better']),
      }
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
