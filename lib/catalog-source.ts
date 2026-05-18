/**
 * Single switching surface between SRS and QXO catalogs.
 *
 * Every API route that touches Supabase product tables routes through this
 * module so the difference between the two catalogs lives in exactly one file
 * instead of being smeared across brands / product-lines / preview / upload /
 * proposal-preview / create-proposals / validate / create-vendor.
 *
 * The two catalogs differ in:
 *
 *   - Table names                    srs_products  / srs_variants
 *                                    qxo_products  / qxo_variants
 *   - PK column                       product_id (int) / product_key (text)
 *   - Brand column                    manufacturer_norm / brand_norm
 *   - Category column                 product_category (enum) / category_norm (text)
 *   - Variant SKU                     variant_code / variant_sku (int)
 *   - Variant color                   color_name / color
 *   - Stock filter (QXO only)         is_stocked_anywhere=true  AND
 *                                     join to qxo_branch_sku for selected branch
 *
 * Functions here are pure helpers; they don't import the Supabase client.
 * Callers pass it in (the supabase singleton from lib/supabase).
 */

import type { CatalogSource } from '@/types/wizard'

export const SOURCES: CatalogSource[] = ['srs', 'qxo']

export interface CatalogTables {
  products: 'srs_products' | 'qxo_products'
  variants: 'srs_variants' | 'qxo_variants'
}

export interface CatalogColumns {
  productPk: 'product_id' | 'product_key'
  brand:     'manufacturer_norm' | 'brand_norm'
  category:  'product_category' | 'category_norm'
  variantPk: 'variant_id' | 'variant_sku'
  variantSku: 'variant_code' | 'variant_sku'
  variantColor: 'color_name' | 'color'
  variantFk: 'product_id' | 'product_key'
}

export interface CatalogConfig {
  source: CatalogSource
  tables: CatalogTables
  cols: CatalogColumns
  // For QXO: filter to "this product has ≥1 stocked variant somewhere"
  // before the per-branch filter. Always true for QXO; n/a for SRS.
  hasStockedFlag: boolean
  // For QXO: branch_num filters availability via qxo_branch_sku join.
  branchAware: boolean
}

const SRS: CatalogConfig = {
  source: 'srs',
  tables: { products: 'srs_products', variants: 'srs_variants' },
  cols: {
    productPk:    'product_id',
    brand:        'manufacturer_norm',
    category:     'product_category',
    variantPk:    'variant_id',
    variantSku:   'variant_code',
    variantColor: 'color_name',
    variantFk:    'product_id',
  },
  hasStockedFlag: false,
  branchAware:    false,
}

const QXO: CatalogConfig = {
  source: 'qxo',
  tables: { products: 'qxo_products', variants: 'qxo_variants' },
  cols: {
    productPk:    'product_key',
    brand:        'brand_norm',
    category:     'category_norm',
    variantPk:    'variant_sku',
    variantSku:   'variant_sku',
    variantColor: 'color',
    variantFk:    'product_key',
  },
  hasStockedFlag: true,
  branchAware:    true,
}

export function catalogConfig(source: CatalogSource): CatalogConfig {
  return source === 'qxo' ? QXO : SRS
}

/**
 * Get the set of product keys (or product_ids) that the selected QXO branch
 * stocks. SRS catalog is branch-agnostic so this is only called when
 * source==='qxo' and a branch is selected.
 *
 * Returns a Set of variant_sku integers; caller joins those to qxo_variants to
 * find the corresponding product_keys. Splitting it out this way keeps the
 * 1000-row PostgREST cap predictable — the avail count per branch is well
 * under 3K (p99) so this is one paginated read.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getStockedVariantSkus(
  supabase: SupabaseClient,
  branchNum: number,
): Promise<Set<number>> {
  const PAGE = 1000
  const skus = new Set<number>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('qxo_branch_sku')
      .select('variant_sku')
      .eq('branch_num', branchNum)
      .eq('branch_available', true)
      .order('variant_sku')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`getStockedVariantSkus: ${error.message}`)
    for (const r of data) skus.add((r as { variant_sku: number }).variant_sku)
    if (data.length < PAGE) break
    from += PAGE
  }
  return skus
}

/**
 * Given a set of variant_skus stocked at the branch, return the set of QXO
 * product_keys that have ≥1 of those SKUs. Used to gate brand/product-line
 * queries to only products the branch carries.
 */
export async function getStockedProductKeys(
  supabase: SupabaseClient,
  branchNum: number,
): Promise<Set<string>> {
  const stockedSkus = await getStockedVariantSkus(supabase, branchNum)
  if (stockedSkus.size === 0) return new Set()

  // Fetch (variant_sku, product_key) only for the stocked SKUs. Supabase
  // .in() chunks ~500 ids before URL length becomes a problem.
  const skuArray = [...stockedSkus]
  const CHUNK = 500
  const productKeys = new Set<string>()
  for (let i = 0; i < skuArray.length; i += CHUNK) {
    const chunk = skuArray.slice(i, i + CHUNK)
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data, error } = await supabase
        .from('qxo_variants')
        .select('product_key')
        .in('variant_sku', chunk)
        .order('variant_sku')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`getStockedProductKeys: ${error.message}`)
      for (const r of data) productKeys.add((r as { product_key: string }).product_key)
      if (data.length < PAGE) break
      from += PAGE
    }
  }
  return productKeys
}

/**
 * Big 3 brand list for the catalog. SRS uses an is_big3_brand column;
 * QXO doesn't have one (yet), so we hardcode the canonical names.
 */
export const QXO_BIG3 = new Set(['Gaf', 'Certainteed', 'Owens Corning'])

/**
 * Common gutter / siding category filters per source. SRS uses enum names,
 * QXO uses free-text category_norm matches.
 */
export const SRS_TRADE_CATEGORY: Record<string, string> = {
  gutters: 'GUTTER/ALUMINUM/COIL',
  siding:  'SIDING',
}

/**
 * QXO categories are free text. Map a trade to a list of matching
 * `category_norm` strings — we OR them in the query.
 */
export const QXO_TRADE_CATEGORIES: Record<string, string[]> = {
  gutters: ['Gutters', 'Gutter fittings', 'Gutter fasteners'],
  siding:  [
    'Vinyl siding', 'Aluminium siding', 'Aluminum siding',
    'Fiber cement siding', 'Siding', 'Siding accessories',
    'Cedar siding', 'Wood siding', 'Engineered wood siding',
  ],
}
