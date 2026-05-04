import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ITEM_TO_FORMULA_KEY } from '@/lib/formula-definitions'
import { normalizeCategory } from '@/lib/category-norm'
import type { ProposalLineItem, BrandPackage } from '@/types/wizard'

const CPQ_CATEGORIES = ['SHINGLES', 'HIP AND RIDGE', 'STARTER', 'UNDERLAYMENT', 'ICE AND WATER', 'VENTS']
const CPQ_PROPOSAL_ITEMS = ['Shingles', 'Hip & Ridge Cap', 'Starter Strip', 'Underlayment — Synthetic', 'Underlayment — Felt 30#', 'Ice & Water — Standard', 'Ice & Water — High Temp', 'Box Vent', 'Ridge Vent']
const UNIVERSAL_ITEMS = ['Drip Edge', 'Coil Nails', 'Fasteners']
const UNIVERSAL_CATEGORIES = ['DRIP EDGE', 'COIL NAILS', 'OTHER FASTENERS']

// Tier fallback chain per component
function pickProduct(
  products: { tier: string; items: ProposalLineItem[] }[],
  tierPrefs: string[]
): ProposalLineItem | null {
  for (const tier of tierPrefs) {
    const group = products.find(p => p.tier === tier)
    if (group && group.items.length > 0) {
      return group.items.find(i => i.family_tier !== null) ?? group.items[0]
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { selectedBrands } = await req.json() as { selectedBrands: string[] }

    const result: Record<string, BrandPackage> = {}

    for (const brand of selectedBrands) {
      // Fetch all CPQ-relevant products for this brand
      const { data: brandProducts } = await supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item, is_universal')
        .eq('manufacturer_norm', brand)
        .eq('exclude_default', false)
        .in('product_category', CPQ_CATEGORIES)
        .limit(500)

      if (!brandProducts?.length) continue

      // Check if brand has shingles in 2+ tiers — only eligible brands get packages
      const shingleTiers = new Set(
        brandProducts
          .filter(p => p.product_category === 'SHINGLES' || p.proposal_line_item === 'Shingles')
          .map(p => p.family_tier)
          .filter(Boolean)
      )
      if (shingleTiers.size < 2) continue

      // Group by normalized component + tier
      const byComponent: Record<string, { tier: string; items: ProposalLineItem[] }[]> = {}

      for (const p of brandProducts) {
        const comp = normalizeCategory(p.proposal_line_item, p.product_category)
        if (!CPQ_PROPOSAL_ITEMS.includes(comp)) continue

        const tier = p.family_tier ?? 'null'
        if (!byComponent[comp]) byComponent[comp] = []

        let group = byComponent[comp].find(g => g.tier === tier)
        if (!group) {
          group = { tier, items: [] }
          byComponent[comp].push(group)
        }

        group.items.push({
          product_id: p.product_id,
          product_name: p.product_name,
          proposal_line_item: comp,
          formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
          suggested_price: p.suggested_price,
          family_tier: p.family_tier,
        })

        // Sort so primary_item comes first
        group.items.sort((a, b) => {
          const ap = brandProducts.find(x => x.product_id === a.product_id)?.primary_item ? 0 : 1
          const bp = brandProducts.find(x => x.product_id === b.product_id)?.primary_item ? 0 : 1
          return ap - bp
        })
      }

      // Fetch manufacturer-varies universals (drip edge, nails)
      const { data: universals } = await supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item')
        .eq('exclude_default', false)
        .eq('is_universal', true)
        .ilike('manufacturer_norm', '%manufacturer varies%')
        .in('product_category', UNIVERSAL_CATEGORIES)
        .limit(50)

      const universalByComp: Record<string, ProposalLineItem> = {}
      for (const p of universals ?? []) {
        const comp = normalizeCategory(p.proposal_line_item, p.product_category)
        if (!UNIVERSAL_ITEMS.includes(comp)) continue
        if (!universalByComp[comp] || p.primary_item) {
          universalByComp[comp] = {
            product_id: p.product_id,
            product_name: p.product_name,
            proposal_line_item: comp,
            formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
            suggested_price: p.suggested_price,
            family_tier: null,
          }
        }
      }

      // Assemble 3 packages
      const buildPackage = (shingleTier: string[], hipRidgeTier: string[], starterTier: string[]): ProposalLineItem[] => {
        const lines: ProposalLineItem[] = []

        const shingles = pickProduct(byComponent['Shingles'] ?? [], shingleTier)
        if (shingles) lines.push(shingles)

        const hipRidge = pickProduct(byComponent['Hip & Ridge Cap'] ?? [], hipRidgeTier)
        if (hipRidge) lines.push(hipRidge)

        const starter = pickProduct(byComponent['Starter Strip'] ?? [], starterTier)
        if (starter) lines.push(starter)

        // Common components — always from 'good' tier
        for (const comp of ['Underlayment — Synthetic', 'Underlayment — Felt 30#', 'Ice & Water — Standard', 'Ice & Water — High Temp', 'Box Vent', 'Ridge Vent']) {
          const item = pickProduct(byComponent[comp] ?? [], ['good', 'addon', 'better', 'best'])
          if (item) { lines.push(item); break }  // only one underlayment/vent type
        }
        for (const comp of ['Ice & Water — Standard', 'Ice & Water — High Temp']) {
          const item = pickProduct(byComponent[comp] ?? [], ['good', 'addon', 'better'])
          if (item) { lines.push(item); break }
        }
        for (const comp of ['Box Vent', 'Ridge Vent']) {
          const item = pickProduct(byComponent[comp] ?? [], ['good', 'addon', 'better'])
          if (item) { lines.push(item); break }
        }

        // Universal accessories
        for (const comp of UNIVERSAL_ITEMS) {
          if (universalByComp[comp]) lines.push(universalByComp[comp])
        }

        return lines
      }

      result[brand] = {
        good:   buildPackage(['addon', 'good'],         ['addon', 'good'],   ['addon', 'good']),
        better: buildPackage(['good',  'addon'],         ['good',  'addon'],  ['good',  'addon']),
        best:   buildPackage(['best',  'better', 'good'], ['best', 'good'],   ['best',  'good']),
      }
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
