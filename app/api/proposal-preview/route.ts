import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ITEM_TO_FORMULA_KEY } from '@/lib/formula-definitions'
import { normalizeCategory } from '@/lib/category-norm'
import { ACCESSORY_PRODUCT_IDS } from '@/lib/accessory-catalog'
import type { ProposalLineItem, BrandPackage } from '@/types/wizard'

const CPQ_CATEGORIES = ['SHINGLES', 'HIP AND RIDGE', 'STARTER', 'UNDERLAYMENT', 'ICE AND WATER', 'VENTS']
const CPQ_COMPONENTS = ['Shingles', 'Hip & Ridge Cap', 'Starter Strip', 'Underlayment — Synthetic', 'Underlayment — Felt 30#', 'Ice & Water — Standard', 'Ice & Water — High Temp', 'Box Vent', 'Ridge Vent']

// Universal accessories — same across Good / Better / Best, sourced from ACCESSORY_PRODUCT_IDS
const UNIVERSAL_COMPONENTS = [
  'Drip Edge', 'Step Flashing', 'W-Valley', 'Counter / Headwall Flashing',
  'Pipe Boot 3"', 'Coil Nails', 'Plastic Cap Nails', 'Fasteners', 'Caulk / Sealant',
  'Ridge Vent',  // Lomanco vents from accessory catalog — fallback when brand has no ridge vent
]

// Curated gutter proposal line items (all have CPQ formulas)
const GUTTER_PROPOSAL_ITEMS = [
  'Gutter Sections', 'Downspouts', 'Gutter Elbows',
  'Gutter End Caps', 'Gutter Inside Corners', 'Gutter Outside Corners',
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

    const result: Record<string, BrandPackage | ProposalLineItem[]> = {}

    // ── Universal accessories (fetched once, same for every brand) ───────────
    const { data: universalProducts } = await supabase
      .from('srs_products')
      .select('product_id, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item')
      .in('product_id', ACCESSORY_PRODUCT_IDS)
      .limit(30)

    const universalMap: Record<string, ProposalLineItem> = {}
    for (const p of universalProducts ?? []) {
      const comp = normalizeCategory(p.proposal_line_item, p.product_category)
      if (!UNIVERSAL_COMPONENTS.includes(comp)) continue
      if (!universalMap[comp] || p.primary_item)
        universalMap[comp] = { product_id: p.product_id, product_name: p.product_name, proposal_line_item: comp, formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null, suggested_price: p.suggested_price, family_tier: null }
    }

    // ── Roofing G/B/B packages ────────────────────────────────────────────────
    if (selectedTrades.includes('roofing')) {
      for (const brand of selectedBrands) {
        const allowedLines = selectedProductLines[brand] ?? []

        const query = supabase
          .from('srs_products')
          .select('product_id, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item, product_line')
          .eq('manufacturer_norm', brand)
          .eq('exclude_default', false)
          .in('product_category', CPQ_CATEGORIES)

        if (allowedLines.length > 0) query.in('product_line', allowedLines)

        const { data: brandProducts } = await query.limit(500)
        if (!brandProducts?.length) continue

        const shingleTiers = new Set(
          brandProducts.filter(p => p.product_category === 'SHINGLES' || p.proposal_line_item === 'Shingles')
            .map(p => p.family_tier).filter(Boolean)
        )
        if (shingleTiers.size < 2) continue

        const byCompTier: Record<string, Record<string, ProposalLineItem[]>> = {}
        for (const p of brandProducts) {
          const comp = normalizeCategory(p.proposal_line_item, p.product_category)
          if (!CPQ_COMPONENTS.includes(comp)) continue
          const tier = p.family_tier ?? 'null'
          if (!byCompTier[comp]) byCompTier[comp] = {}
          if (!byCompTier[comp][tier]) byCompTier[comp][tier] = []
          byCompTier[comp][tier].push({ product_id: p.product_id, product_name: p.product_name, proposal_line_item: comp, formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null, suggested_price: p.suggested_price, family_tier: p.family_tier })
          if (p.primary_item) { const arr = byCompTier[comp][tier]; arr.unshift(arr.pop()!) }
        }

        const buildPackage = (shingleTiers: string[], accessoryTiers: string[]): ProposalLineItem[] => {
          const lines: ProposalLineItem[] = []
          const shingles = pickProduct(byCompTier['Shingles'] ?? {}, shingleTiers)
          if (shingles) lines.push(shingles)
          const hip = pickProduct(byCompTier['Hip & Ridge Cap'] ?? {}, accessoryTiers)
          if (hip) lines.push(hip)
          const starter = pickProduct(byCompTier['Starter Strip'] ?? {}, accessoryTiers)
          if (starter) lines.push(starter)
          for (const comp of ['Underlayment — Synthetic', 'Underlayment — Felt 30#']) {
            const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
            if (item) { lines.push(item); break }
          }
          for (const comp of ['Ice & Water — Standard', 'Ice & Water — High Temp']) {
            const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
            if (item) { lines.push(item); break }
          }
          for (const comp of ['Box Vent', 'Ridge Vent']) {
            const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better']) ?? universalMap[comp] ?? null
            if (item) { lines.push(item); break }
          }
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
    }

    // ── Gutter curated items (same across all tiers) ──────────────────────────
    if (selectedTrades.includes('gutters') && selectedGutterBrands.length > 0) {
      const gutterItems: ProposalLineItem[] = []
      const seen = new Set<string>()

      for (const itemLabel of GUTTER_PROPOSAL_ITEMS) {
        for (const brand of selectedGutterBrands) {
          const allowedLines = selectedGutterProductLines[brand] ?? []
          const q = supabase
            .from('srs_products')
            .select('product_id, product_name, proposal_line_item, suggested_price')
            .eq('manufacturer_norm', brand)
            .eq('proposal_line_item', itemLabel)
            .eq('exclude_default', false)

          if (allowedLines.length > 0) q.in('product_line', allowedLines)

          const { data } = await q.order('primary_item', { ascending: false }).limit(1)
          const p = data?.[0]
          if (p && !seen.has(itemLabel)) {
            seen.add(itemLabel)
            gutterItems.push({
              product_id: p.product_id, product_name: p.product_name,
              proposal_line_item: itemLabel, formula_key: ITEM_TO_FORMULA_KEY[itemLabel] ?? null,
              suggested_price: p.suggested_price, family_tier: null,
            })
            break
          }
        }
      }
      result.__gutters = gutterItems
    }

    // ── Siding curated items (one per brand) ──────────────────────────────────
    if (selectedTrades.includes('siding') && selectedSidingBrands.length > 0) {
      const sidingItems: ProposalLineItem[] = []

      for (const brand of selectedSidingBrands) {
        const allowedLines = selectedSidingProductLines[brand] ?? []
        const q = supabase
          .from('srs_products')
          .select('product_id, product_name, proposal_line_item, suggested_price')
          .eq('manufacturer_norm', brand)
          .eq('proposal_line_item', 'Siding')
          .eq('exclude_default', false)

        if (allowedLines.length > 0) q.in('product_line', allowedLines)

        const { data } = await q.order('primary_item', { ascending: false }).limit(1)
        const p = data?.[0]
        if (p) {
          sidingItems.push({
            product_id: p.product_id, product_name: p.product_name,
            proposal_line_item: 'Siding', formula_key: ITEM_TO_FORMULA_KEY['Siding'] ?? null,
            suggested_price: p.suggested_price, family_tier: null,
          })
        }
      }
      result.__siding = sidingItems
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
