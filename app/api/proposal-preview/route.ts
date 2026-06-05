import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ITEM_TO_FORMULA_KEY } from '@/lib/formula-definitions'
import { normalizeCategory } from '@/lib/category-norm'
import { ACCESSORY_PRODUCT_IDS } from '@/lib/accessory-catalog'
import { ABC_ACCESSORY_PRODUCT_IDS } from '@/lib/abc-accessory-catalog'
import { QXO_ACCESSORY_PRODUCT_KEYS } from '@/lib/qxo-accessory-catalog'
import { catalogConfig, ACCESSORY_TIER_BY_PROPOSAL, type CatalogConfig } from '@/lib/catalog-source'
import { isFlagship } from '@/lib/flagship-lines'
import { rulesForBrand, type ProposalTier, type TierUpgradeRule } from '@/lib/tier-upgrade-rules'
import type { ProposalLineItem, BrandPackage, CatalogSource } from '@/types/wizard'

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

/**
 * Resolve tier-upgrade rules for one brand to actual products from Supabase.
 * Returns: tier → { replaced_component → upgraded ProposalLineItem }.
 * Failures (no matching product) silently drop the rule — the package falls
 * back to the standard universal accessory.
 */
async function resolveTierOverrides(cfg: CatalogConfig, rules: TierUpgradeRule[]): Promise<Map<ProposalTier, Record<string, ProposalLineItem>>> {
  const out = new Map<ProposalTier, Record<string, ProposalLineItem>>()
  const selectCols = cfg.source === 'srs'
    ? `${cfg.cols.productPk}, product_name, proposal_line_item, suggested_price, primary_item`
    : `${cfg.cols.productPk}, product_name, proposal_line_item, suggested_price`
  for (const rule of rules) {
    let q: any = supabase
      .from(cfg.tables.products)
      .select(selectCols)
      .eq('exclude_default', false)
    if (rule.with.manufacturer_norm) q = q.eq(cfg.cols.brand, rule.with.manufacturer_norm)
    if (rule.with.new_component) q = q.eq('proposal_line_item', rule.with.new_component)
    if (rule.with.product_name_ilike) q = q.ilike('product_name', rule.with.product_name_ilike)

    // Order by primary_item for SRS; cheapest-first for ABC/QXO since they
    // lack a primary_item column.
    q = cfg.source === 'srs'
      ? q.order('primary_item', { ascending: false })
      : q.order('suggested_price', { ascending: true, nullsFirst: false })
    const { data } = await q.limit(1)
    const p = data?.[0]
    if (!p) continue

    const comp = rule.with.new_component ?? rule.replace_component
    const item: ProposalLineItem = {
      product_id: p[cfg.cols.productPk],
      product_name: p.product_name,
      proposal_line_item: comp,
      formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
      suggested_price: p.suggested_price,
      family_tier: null,
    }
    if (!out.has(rule.tier)) out.set(rule.tier, {})
    out.get(rule.tier)![rule.replace_component] = item
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const {
      selectedBrands, selectedProductLines,
      selectedTrades = ['roofing'],
      selectedGutterBrands = [], selectedGutterProductLines = {},
      selectedSidingBrands  = [], selectedSidingProductLines  = {},
      catalogSource = 'srs',
    } = await req.json() as {
      selectedBrands: string[]
      selectedProductLines: Record<string, string[]>
      selectedTrades?: string[]
      selectedGutterBrands?: string[]
      selectedGutterProductLines?: Record<string, string[]>
      selectedSidingBrands?: string[]
      selectedSidingProductLines?: Record<string, string[]>
      catalogSource?: CatalogSource
    }

    const cfg = catalogConfig(catalogSource)
    const accessoryIds: (number | string)[] =
      cfg.source === 'srs' ? ACCESSORY_PRODUCT_IDS :
      cfg.source === 'abc' ? ABC_ACCESSORY_PRODUCT_IDS :
      QXO_ACCESSORY_PRODUCT_KEYS

    const result: Record<string, BrandPackage | ProposalLineItem[]> = {}

    // ── Universal accessories (fetched once, same for every brand) ───────────
    // Base map — curated accessoryIds for the source. For SRS, primary_item
    // breaks ties when multiple products land in the same component slot.
    // For ABC/QXO no primary_item column — first match wins.
    const universalSelect = cfg.source === 'srs'
      ? `${cfg.cols.productPk}, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item`
      : `${cfg.cols.productPk}, product_name, product_category, proposal_line_item, family_tier, suggested_price`
    const { data: universalProducts } = await supabase
      .from(cfg.tables.products)
      .select(universalSelect)
      .in(cfg.cols.productPk, accessoryIds as never[])
      .limit(50)

    const universalMap: Record<string, ProposalLineItem> = {}
    for (const p of (universalProducts ?? []) as unknown as Array<Record<string, unknown>>) {
      const comp = normalizeCategory(p.proposal_line_item as string, p.product_category as string)
      if (!UNIVERSAL_COMPONENTS.includes(comp)) continue
      const isPrimary = cfg.source === 'srs' && p.primary_item === true
      if (!universalMap[comp] || isPrimary)
        universalMap[comp] = {
          product_id: p[cfg.cols.productPk] as number | string,
          product_name: p.product_name as string,
          proposal_line_item: comp,
          formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
          suggested_price: p.suggested_price as number | null,
          family_tier: null,
        }
    }

    // ── Per-tier universal maps (Good/Better/Best differentiation) ───────────
    // SRS uses one curated accessory list across all tiers (per v2 user choice).
    // ABC and QXO leverage the accessory_tier column to pick cheaper-per-tier
    // accessories for Good and more-premium for Best. Falls back to the base
    // universalMap if no accessory_tier match exists for a given slot.
    const universalMapByTier: Record<ProposalTier, Record<string, ProposalLineItem>> = {
      good:   { ...universalMap },
      better: { ...universalMap },
      best:   { ...universalMap },
    }
    if (cfg.source !== 'srs') {
      for (const tier of ['good', 'better', 'best'] as const) {
        const accessoryTier = ACCESSORY_TIER_BY_PROPOSAL[tier]
        // Best tier picks the most expensive within the band; Good picks the
        // cheapest; Better picks the cheapest in the better band (middle).
        const ascending = tier !== 'best'
        const { data: tierAccessories } = await supabase
          .from(cfg.tables.products)
          .select(`${cfg.cols.productPk}, product_name, product_category, proposal_line_item, suggested_price`)
          .eq('accessory_tier', accessoryTier)
          .in('proposal_line_item', UNIVERSAL_COMPONENTS)
          // Only pick from the accessories the upload actually sent (same fixed list
          // the base universalMap uses). Without this, the per-tier query selects
          // cheaper/pricier family_ids from the whole catalog that were never uploaded,
          // so create-proposals can't resolve them and skips the line item.
          .in(cfg.cols.productPk, accessoryIds as never[])
          .order('suggested_price', { ascending, nullsFirst: false })
          .limit(500)

        for (const p of (tierAccessories ?? []) as Array<Record<string, unknown>>) {
          const comp = normalizeCategory(p.proposal_line_item as string, p.product_category as string)
          if (!UNIVERSAL_COMPONENTS.includes(comp)) continue
          // Only set if not already populated — first match wins (which is the
          // cheapest/most-expensive depending on tier per the order above).
          if (!universalMapByTier[tier][comp] || universalMapByTier[tier][comp] === universalMap[comp]) {
            universalMapByTier[tier][comp] = {
              product_id: p[cfg.cols.productPk] as number | string,
              product_name: p.product_name as string,
              proposal_line_item: comp,
              formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
              suggested_price: p.suggested_price as number | null,
              family_tier: null,
            }
          }
        }
      }
    }

    // ── Roofing G/B/B packages ────────────────────────────────────────────────
    if (selectedTrades.includes('roofing')) {
      const brandSelect = cfg.source === 'srs'
        ? `${cfg.cols.productPk}, product_name, product_category, proposal_line_item, family_tier, suggested_price, primary_item, product_line`
        : `${cfg.cols.productPk}, product_name, product_category, proposal_line_item, family_tier, suggested_price, product_line`

      for (const brand of selectedBrands) {
        const allowedLines = selectedProductLines[brand] ?? []

        // Resolve brand-specific accessory upgrades for Better / Best tiers.
        // Most brands have no rules → empty map → no-op.
        const tierOverrides = await resolveTierOverrides(cfg, rulesForBrand(brand))

        const query = supabase
          .from(cfg.tables.products)
          .select(brandSelect)
          .eq(cfg.cols.brand, brand)
          .eq('exclude_default', false)
          .in(cfg.cols.category, CPQ_CATEGORIES)

        if (allowedLines.length > 0) query.in('product_line', allowedLines)

        const { data: brandProducts } = await query.limit(500) as unknown as { data: Array<Record<string, unknown>> | null }
        if (!brandProducts?.length) continue

        const shingleTiers = new Set(
          brandProducts.filter(p => p.product_category === 'SHINGLES' || p.proposal_line_item === 'Shingles')
            .map(p => p.family_tier as string | null).filter(Boolean) as string[]
        )
        if (shingleTiers.size < 2) continue

        const byCompTier: Record<string, Record<string, ProposalLineItem[]>> = {}
        for (const p of brandProducts) {
          const comp = normalizeCategory(p.proposal_line_item as string, p.product_category as string)
          if (!CPQ_COMPONENTS.includes(comp)) continue
          const tier = (p.family_tier as string | null) ?? 'null'
          if (!byCompTier[comp]) byCompTier[comp] = {}
          if (!byCompTier[comp][tier]) byCompTier[comp][tier] = []
          byCompTier[comp][tier].push({
            product_id: p[cfg.cols.productPk] as number | string,
            product_name: p.product_name as string,
            proposal_line_item: comp,
            formula_key: ITEM_TO_FORMULA_KEY[comp] ?? null,
            suggested_price: p.suggested_price as number | null,
            family_tier: p.family_tier as string | null,
          })
          // Bubble the curated flagship to the front of its tier list.
          // SRS uses the primary_item DB column; ABC/QXO use the JS isFlagship
          // helper that intersects product_line with FLAGSHIP_PATTERNS.
          const isDefault = cfg.source === 'srs'
            ? p.primary_item === true
            : isFlagship(cfg.source, brand, p.product_line as string | null)
          if (isDefault) { const arr = byCompTier[comp][tier]; arr.unshift(arr.pop()!) }
        }

        const buildPackage = (tierName: ProposalTier, shingleTiers: string[], accessoryTiers: string[]): ProposalLineItem[] => {
          const overrides = tierOverrides.get(tierName) ?? {}
          const tierUniversal = universalMapByTier[tierName]
          const lines: ProposalLineItem[] = []
          const shingles = pickProduct(byCompTier['Shingles'] ?? {}, shingleTiers)
          if (shingles) lines.push(shingles)
          const hip = pickProduct(byCompTier['Hip & Ridge Cap'] ?? {}, accessoryTiers)
          if (hip) lines.push(hip)
          // Starter — brand-specific upgrade may swap this slot for Better/Best.
          const starter = overrides['Starter Strip']
            ?? pickProduct(byCompTier['Starter Strip'] ?? {}, accessoryTiers)
          if (starter) lines.push(starter)
          for (const comp of ['Underlayment — Synthetic', 'Underlayment — Felt 30#']) {
            const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
            if (item) { lines.push(item); break }
          }
          // Ice & Water — brand-specific upgrade may swap Standard for High Temp.
          const iceWaterOverride = overrides['Ice & Water — Standard']
          if (iceWaterOverride) {
            lines.push(iceWaterOverride)
          } else {
            for (const comp of ['Ice & Water — Standard', 'Ice & Water — High Temp']) {
              const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better'])
              if (item) { lines.push(item); break }
            }
          }
          for (const comp of ['Box Vent', 'Ridge Vent']) {
            const item = pickProduct(byCompTier[comp] ?? {}, ['good', 'addon', 'better']) ?? tierUniversal[comp] ?? null
            if (item) { lines.push(item); break }
          }
          for (const comp of UNIVERSAL_COMPONENTS) {
            // Skip components already pushed above (starter/ice-water handled separately).
            if (comp === 'Starter Strip' || comp === 'Ice & Water — Standard') continue
            const item = overrides[comp] ?? tierUniversal[comp]
            if (item) lines.push(item)
          }
          return lines
        }

        result[brand] = {
          good:   buildPackage('good',   ['addon', 'good'],          ['addon', 'good', 'better', 'best']),
          better: buildPackage('better', ['good',  'addon'],          ['good',  'addon', 'better', 'best']),
          best:   buildPackage('best',   ['best',  'better', 'good'], ['best',  'good',  'addon',  'better']),
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
          let q: any = supabase
            .from(cfg.tables.products)
            .select(`${cfg.cols.productPk}, product_name, proposal_line_item, suggested_price`)
            .eq(cfg.cols.brand, brand)
            .eq('proposal_line_item', itemLabel)
            .eq('exclude_default', false)

          if (allowedLines.length > 0) q = q.in('product_line', allowedLines)

          // SRS uses primary_item; ABC/QXO order by cheapest as default pick.
          q = cfg.source === 'srs'
            ? q.order('primary_item', { ascending: false })
            : q.order('suggested_price', { ascending: true, nullsFirst: false })
          const { data } = await q.limit(1)
          const p = data?.[0]
          if (p && !seen.has(itemLabel)) {
            seen.add(itemLabel)
            gutterItems.push({
              product_id: p[cfg.cols.productPk], product_name: p.product_name,
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
        let q: any = supabase
          .from(cfg.tables.products)
          .select(`${cfg.cols.productPk}, product_name, proposal_line_item, suggested_price`)
          .eq(cfg.cols.brand, brand)
          .eq('proposal_line_item', 'Siding')
          .eq('exclude_default', false)

        if (allowedLines.length > 0) q = q.in('product_line', allowedLines)

        q = cfg.source === 'srs'
          ? q.order('primary_item', { ascending: false })
          : q.order('suggested_price', { ascending: true, nullsFirst: false })
        const { data } = await q.limit(1)
        const p = data?.[0]
        if (p) {
          sidingItems.push({
            product_id: p[cfg.cols.productPk], product_name: p.product_name,
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
