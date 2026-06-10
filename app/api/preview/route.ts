import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CATEGORY_NORM } from '@/lib/category-norm'
import { ACCESSORY_PRODUCT_IDS } from '@/lib/accessory-catalog'
import { QXO_ACCESSORY_PRODUCT_KEYS } from '@/lib/qxo-accessory-catalog'
import { ABC_ACCESSORY_PRODUCT_IDS } from '@/lib/abc-accessory-catalog'
import {
  catalogConfig, getStockedProductKeys,
  SRS_TRADE_CATEGORY, QXO_TRADE_CATEGORIES,
} from '@/lib/catalog-source'
import type { CatalogSource } from '@/types/wizard'

const PAGE = 1000

interface PreviewRow {
  product_id: number | string
  product_name: string
  product_category: string | null  // free text for QXO, enum for SRS
  manufacturer_norm: string | null
  product_line: string | null
  family_tier: string | null
  proposal_line_item: string | null
  suggested_price: number | null
}

export async function POST(req: NextRequest) {
  try {
    const {
      selectedBrands = [], selectedProductLines = {},
      selectedTrades = ['roofing'],
      selectedGutterBrands = [], selectedGutterProductLines = {},
      selectedSidingBrands  = [], selectedSidingProductLines  = {},
      catalogSource = 'srs',
      branchNum,
    } = await req.json() as {
      selectedBrands?: string[]
      selectedProductLines?: Record<string, string[]>
      selectedTrades?: string[]
      selectedGutterBrands?: string[]
      selectedGutterProductLines?: Record<string, string[]>
      selectedSidingBrands?: string[]
      selectedSidingProductLines?: Record<string, string[]>
      catalogSource?: CatalogSource
      branchNum?: number
    }

    if (catalogSource === 'qxo' && branchNum == null) {
      return NextResponse.json({ error: 'QXO requires branchNum' }, { status: 400 })
    }

    const cfg = catalogConfig(catalogSource)
    const allProducts: PreviewRow[] = []

    // ── For QXO: precompute stocked-product key set, used as join filter ─────
    let stockedKeys: string[] | null = null
    if (cfg.source === 'qxo') {
      const set = await getStockedProductKeys(supabase, branchNum!)
      stockedKeys = [...set]
      if (stockedKeys.length === 0) {
        return NextResponse.json({ products: [], productIds: [], counts: { total: 0, byCategory: {} }, accessoryCount: 0 })
      }
    }

    /**
     * Common paginated read for one trade. Builds the appropriate query for
     * the catalog source and pages through all results. For QXO this also
     * intersects with the branch-stocked key set.
     */
    const fetchTrade = async (
      trade: 'roofing' | 'gutters' | 'siding',
      brands: string[],
    ) => {
      if (brands.length === 0) return
      // Common selected columns — names line up across both catalogs:
      // we always alias the brand column to manufacturer_norm and the category
      // column to product_category to keep downstream code simple.
      const SELECT = (cfg.source !== 'qxo')
        ? 'product_id, product_name, product_category, manufacturer_norm, product_line, family_tier, proposal_line_item, suggested_price'
        : 'product_key, product_name, category_norm, brand_norm, product_line, family_tier, proposal_line_item, suggested_price'

      // PostgREST parses unquoted in.() values on commas/parens — a brand name
      // containing either would silently corrupt the filter. Double-quote each
      // value (no such brands exist today; this is hardening).
      const quotedBrands = brands.map(b => `"${b.replace(/"/g, '\\"')}"`).join(',')

      const buildQuery = (pageStart: number, pageEnd: number) => {
        let q: any = supabase.from(cfg.tables.products).select(SELECT).eq('exclude_default', false)
        if (cfg.source !== 'qxo') {
          // SRS + ABC: same column shape. Roofing: brands OR universal manufacturer-varies items.
          if (trade === 'roofing') {
            q = q.or(`manufacturer_norm.in.(${quotedBrands}),and(is_universal.eq.true,manufacturer_norm.ilike.%manufacturer varies%)`)
          } else if (trade === 'gutters') {
            q = q.or(`manufacturer_norm.in.(${quotedBrands}),and(is_universal.eq.true,manufacturer_norm.ilike.%manufacturer varies%)`)
              .eq('product_category', SRS_TRADE_CATEGORY[trade])
          } else { // siding
            q = q.in('manufacturer_norm', brands).eq('product_category', SRS_TRADE_CATEGORY[trade])
          }
        } else {
          // QXO: brand filter + branch-stocked + (for gutters/siding) category-set.
          q = q.in('brand_norm', brands).eq('is_stocked_anywhere', true)
          if (trade === 'gutters' || trade === 'siding') {
            q = q.in('category_norm', QXO_TRADE_CATEGORIES[trade])
          }
        }
        return q.range(pageStart, pageEnd)
      }

      const collectChunk = async (extraKeys: string[] | null) => {
        let from = 0
        while (true) {
          let q = buildQuery(from, from + PAGE - 1)
          if (extraKeys) q = q.in('product_key', extraKeys)
          const { data, error } = await q
          if (error) throw new Error(error.message)
          for (const r of (data ?? []) as Record<string, unknown>[]) {
            allProducts.push(toPreviewRow(r, cfg.source))
          }
          if ((data ?? []).length < PAGE) break
          from += PAGE
        }
      }

      if (cfg.source === 'qxo' && stockedKeys) {
        const CHUNK = 500
        for (let i = 0; i < stockedKeys.length; i += CHUNK) {
          await collectChunk(stockedKeys.slice(i, i + CHUNK))
        }
      } else {
        await collectChunk(null)
      }
    }

    if (selectedTrades.includes('roofing')) await fetchTrade('roofing', selectedBrands)
    if (selectedTrades.includes('gutters')) await fetchTrade('gutters', selectedGutterBrands)
    if (selectedTrades.includes('siding'))  await fetchTrade('siding',  selectedSidingBrands)

    // ── Fetch universal accessory products ─────────────────────────────────
    if (cfg.source === 'srs') {
      const { data: accessories, error: accError } = await supabase
        .from('srs_products')
        .select('product_id, product_name, product_category, manufacturer_norm, product_line, family_tier, proposal_line_item, suggested_price')
        .in('product_id', ACCESSORY_PRODUCT_IDS)
      if (accError) throw new Error(`accessory fetch failed: ${accError.message}`)
      for (const r of (accessories ?? []) as Record<string, unknown>[]) {
        allProducts.push(toPreviewRow(r, 'srs'))
      }
    } else if (cfg.source === 'abc' && ABC_ACCESSORY_PRODUCT_IDS.length > 0) {
      const { data: accessories, error: accError } = await supabase
        .from('abc_products')
        .select('product_id, product_name, product_category, manufacturer_norm, product_line, family_tier, proposal_line_item, suggested_price')
        .in('product_id', ABC_ACCESSORY_PRODUCT_IDS)
      if (accError) throw new Error(`accessory fetch failed: ${accError.message}`)
      for (const r of (accessories ?? []) as Record<string, unknown>[]) {
        allProducts.push(toPreviewRow(r, 'abc'))
      }
    } else if (QXO_ACCESSORY_PRODUCT_KEYS.length > 0) {
      const { data: accessories, error: accError } = await supabase
        .from('qxo_products')
        .select('product_key, product_name, category_norm, brand_norm, product_line, family_tier, proposal_line_item, suggested_price')
        .in('product_key', QXO_ACCESSORY_PRODUCT_KEYS)
      if (accError) throw new Error(`accessory fetch failed: ${accError.message}`)
      for (const r of (accessories ?? []) as Record<string, unknown>[]) {
        allProducts.push(toPreviewRow(r, 'qxo'))
      }
    }

    // ── Deduplicate ────────────────────────────────────────────────────────
    const seen = new Set<string>()
    const deduped = allProducts.filter(p => {
      const key = String(p.product_id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // ── Filter by selected product lines per trade ─────────────────────────
    const filtered = deduped.filter(p => {
      const mfr = p.manufacturer_norm
      const isMfgVaries = !mfr || mfr.toLowerCase().includes('manufacturer varies')
      if (isMfgVaries) return true

      if (selectedTrades.includes('roofing') && selectedBrands.includes(mfr!)) {
        const allowedLines = selectedProductLines[mfr!]
        return !allowedLines || allowedLines.includes(p.product_line ?? '')
      }
      if (selectedTrades.includes('gutters') && selectedGutterBrands.includes(mfr!)) {
        const allowedLines = selectedGutterProductLines[mfr!]
        return !allowedLines || allowedLines.includes(p.product_line ?? '')
      }
      if (selectedTrades.includes('siding') && selectedSidingBrands.includes(mfr!)) {
        const allowedLines = selectedSidingProductLines[mfr!]
        return !allowedLines || allowedLines.includes(p.product_line ?? '')
      }
      return true
    })

    const byCategory: Record<string, number> = {}
    for (const p of filtered) {
      const key = p.proposal_line_item
        ?? (p.product_category ? (CATEGORY_NORM[p.product_category] ?? p.product_category) : null)
        ?? 'Other'
      byCategory[key] = (byCategory[key] ?? 0) + 1
    }

    const accessoryKeys = new Set<string>(
      cfg.source === 'srs'
        ? ACCESSORY_PRODUCT_IDS.map(String)
        : cfg.source === 'abc'
          ? ABC_ACCESSORY_PRODUCT_IDS.map(String)
          : QXO_ACCESSORY_PRODUCT_KEYS,
    )
    const accessoryCount = filtered.filter(p => accessoryKeys.has(String(p.product_id))).length

    return NextResponse.json({
      products: filtered,
      productIds: filtered.map(p => p.product_id),
      counts: { total: filtered.length, byCategory },
      accessoryCount,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

function toPreviewRow(r: Record<string, unknown>, source: CatalogSource): PreviewRow {
  if (source !== 'qxo') {
    // SRS + ABC share the same column shape.
    return {
      product_id:         r.product_id as number,
      product_name:       r.product_name as string,
      product_category:   r.product_category as string,
      manufacturer_norm:  r.manufacturer_norm as string | null,
      product_line:       r.product_line as string | null,
      family_tier:        r.family_tier as string | null,
      proposal_line_item: r.proposal_line_item as string | null,
      suggested_price:    r.suggested_price as number | null,
    }
  }
  // QXO
  return {
    product_id:         r.product_key as string,
    product_name:       r.product_name as string,
    product_category:   r.category_norm as string | null,
    manufacturer_norm:  r.brand_norm as string | null,
    product_line:       r.product_line as string | null,
    family_tier:        r.family_tier as string | null,
    proposal_line_item: r.proposal_line_item as string | null,
    suggested_price:    r.suggested_price as number | null,
  }
}
