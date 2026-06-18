import { toZuperUom } from './uom-map'
import { ITEM_TO_FORMULA_KEY } from './formula-definitions'

export interface SrsProduct {
  product_id: number
  product_name: string
  product_category: string
  manufacturer: string | null
  manufacturer_norm: string | null
  product_description: string | null
  product_uom: string | string[] | null
  /** Dominant order_uom across the product's variants — preferred over product_uom[0] (see toZuperUom). */
  order_uom?: string | null
  product_image_url: string | null
  suggested_price: number | null
  purchase_price: number | null
  proposal_line_item: string | null
  family_tier: string | null
}

function mapTier(tier: string | null): string {
  if (tier === 'addon')  return 'Good'
  if (tier === 'good')   return 'Better'
  if (tier === 'better') return 'Best'
  if (tier === 'best')   return 'Best'
  return 'Default'
}

export interface SrsVariant {
  variant_id: number
  product_id: number
  variant_code: string | null
  color_name: string | null
  size_name: string | null
  variant_image_url: string | null
  is_restricted: boolean
}

export interface PriceFallback {
  /** Median suggested_price for (product_category | family_tier) — keyed "CATEGORY|tier" */
  byCategoryTier: Record<string, number>
  /** Median suggested_price for product_category alone — fallback when (cat,tier) has no priced products */
  byCategory: Record<string, number>
}

// Zuper hard-caps a product's option_values at 50.
const OPTION_CAP = 50

const realOpt = (s: string | null | undefined): s is string =>
  !!s && !!s.trim() && !['n/a', 'na'].includes(s.trim().toLowerCase())

export interface ResolvedOptions {
  kind: 'color' | 'size' | 'composite' | null
  option_label: string
  customer_selection: boolean
  mandate_customer_selection: boolean
  values: string[]
  /** The option_value a given variant maps to under the chosen axis (or null). Keeps
   *  the vendor-catalog SKU↔option map aligned with whatever axis we loaded. */
  labelOf: (v: SrsVariant) => string | null
}

/**
 * Decide which option axis to load for a product from its variants — mirrors the
 * standalone account backfill (product importer/backfill-account-options.js):
 *   - both color & size vary → composite "Color — Size" from REAL pairs (no cartesian)
 *   - only color varies       → color
 *   - only size varies        → size
 *   - neither varies, 1 color  → that single color (legacy behavior)
 * Size is only considered when `includeSize` is true — QXO overloads `size_name` with
 * its UOM, so the upload passes includeSize=false for QXO (color-only, unchanged).
 * Shingles get a mandatory customer-facing "Color"; size/composite are non-mandatory.
 * An overflowing composite (>50) falls back to the largest single axis that fits.
 */
export function resolveOptions(
  variants: SrsVariant[],
  productCategory: string,
  includeSize = true,
): ResolvedOptions {
  const uniq = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.filter(realOpt).map(s => s.trim())))
  const colors = uniq(variants.map(v => v.color_name))
  const sizes = includeSize ? uniq(variants.map(v => v.size_name)) : []
  const cVary = colors.length > 1, sVary = sizes.length > 1
  const isShingles = productCategory === 'SHINGLES'
  const cap = <T,>(a: T[]) => a.slice(0, OPTION_CAP)

  const colorRes = (): ResolvedOptions => ({
    kind: 'color',
    option_label: isShingles ? 'Color' : 'Variant',
    customer_selection: isShingles,
    mandate_customer_selection: isShingles,
    values: cap(colors),
    labelOf: v => (realOpt(v.color_name) ? v.color_name.trim() : null),
  })
  const sizeRes = (): ResolvedOptions => ({
    kind: 'size', option_label: 'Size',
    customer_selection: false, mandate_customer_selection: false,
    values: cap(sizes),
    labelOf: v => (realOpt(v.size_name) ? v.size_name.trim() : null),
  })

  if (includeSize && cVary && sVary) {
    const seen = new Set<string>(), combos: string[] = []
    const compositeLabel = (v: SrsVariant) =>
      [v.color_name, v.size_name].filter(realOpt).map(s => s.trim()).join(' — ')
    for (const v of variants) {
      const label = compositeLabel(v)
      if (!label || seen.has(label)) continue
      seen.add(label); combos.push(label)
    }
    if (combos.length) {
      if (combos.length <= OPTION_CAP) {
        return {
          kind: 'composite', option_label: 'Variant',
          customer_selection: false, mandate_customer_selection: false,
          values: combos,
          labelOf: v => compositeLabel(v) || null,
        }
      }
      // Overflow — load the largest single axis that fits; else the largest, capped.
      const axes = [
        { len: colors.length, res: colorRes },
        { len: sizes.length, res: sizeRes },
      ].sort((a, b) => b.len - a.len)
      return (axes.find(a => a.len <= OPTION_CAP) ?? axes[0]).res()
    }
  }
  if (cVary) return colorRes()
  if (includeSize && sVary) return sizeRes()
  if (colors.length >= 1) return colorRes()
  return {
    kind: null, option_label: 'Color',
    customer_selection: false, mandate_customer_selection: false,
    values: [], labelOf: () => null,
  }
}

/**
 * Build the Zuper `option` block from a product's variants. Thin wrapper over
 * resolveOptions — shared by the catalog upload (buildProductPayload) and the
 * remap-options flow so both write options identically.
 */
export function buildOptionBlock(variants: SrsVariant[], productCategory: string, includeSize = true) {
  const r = resolveOptions(variants, productCategory, includeSize)
  return {
    customer_selection: r.customer_selection,
    mandate_customer_selection: r.mandate_customer_selection,
    option_label: r.option_label,
    option_values: r.values.map(v => ({
      option_value: v,
      option_image: '',
      is_available: true,
    })),
  }
}

function resolvePrice(product: SrsProduct, fallback?: PriceFallback): { price: number; estimated: boolean } {
  if (product.suggested_price != null && product.suggested_price > 0) {
    return { price: product.suggested_price, estimated: false }
  }
  if (!fallback) return { price: 0, estimated: false }
  const tierKey = `${product.product_category}|${product.family_tier ?? 'unknown'}`
  const fromTier = fallback.byCategoryTier[tierKey]
  if (fromTier != null && fromTier > 0) return { price: fromTier, estimated: true }
  const fromCat = fallback.byCategory[product.product_category]
  if (fromCat != null && fromCat > 0) return { price: fromCat, estimated: true }
  return { price: 0, estimated: false }
}

export function buildProductPayload(
  product: SrsProduct,
  variants: SrsVariant[],
  categoryMap: Record<string, string>,
  warehouseUid: string,
  formulaMap: Record<string, string>,
  productTierFieldUid: string,
  priceFallback?: PriceFallback,
  includeSize = true,
) {
  const option = buildOptionBlock(variants, product.product_category, includeSize)

  const image = ''

  // Formula — look up via proposal_line_item → formula_key → uid
  const formulaKey = product.proposal_line_item
    ? ITEM_TO_FORMULA_KEY[product.proposal_line_item]
    : undefined
  const formulaUid = formulaKey ? formulaMap[formulaKey] : undefined

  const brand =
    !product.manufacturer_norm || product.manufacturer_norm.toLowerCase().includes('manufacturer varies')
      ? ''
      : (product.manufacturer ?? '')

  const { price, estimated } = resolvePrice(product, priceFallback)

  const productObj: Record<string, unknown> = {
    prefix: '',
    product_name: product.product_name,
    product_id: String(product.product_id),
    is_available: true,
    product_category: categoryMap[product.product_category] ?? '',
    price,
    purchase_price: product.purchase_price ?? null,
    min_quantity: 1,
    quantity: 1,
    currency: '',
    product_manual_link: '',
    product_description: product.product_description
      ? `<p>${product.product_description.slice(0, 2000)}</p>`
      : '',
    product_image: image,
    product_type: 'PARTS',
    pricing_level: 'ROLLUP',
    brand,
    track_quantity: true,
    specification: '',
    has_custom_tax: false,
    uom: toZuperUom(product.order_uom ?? product.product_uom),
    is_billable: true,
    consider_profitability: true,
    is_commissionable: true,
    bu_uids: null,
    location_availability: [{
      location: warehouseUid,
      min_quantity: 1,
      quantity: 1,
      serial_nos: [],
    }],
    tax: { tax_exempt: false, tax_name: '', tax_rate: '' },
    markup: null,
    product_files: [],
    meta_data: [
      { hide_field: false, hide_to_fe: false, id: 0, label: 'Color', read_only: false, type: 'MULTI_LINE', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: '' },
      { hide_field: false, hide_to_fe: false, id: 1, label: 'Color Selected', read_only: false, type: 'SINGLE_LINE', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: '' },
      { hide_field: false, hide_to_fe: false, id: 2, label: 'Color Selection Mandatory', read_only: false, type: 'RADIO', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: '' },
      { hide_field: false, hide_to_fe: false, id: 3, label: 'Display Color Selection', read_only: false, type: 'RADIO', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: '' },
      ...(productTierFieldUid ? [{ hide_field: false, hide_to_fe: false, id: 4, label: 'Product Tier', custom_field_uid: productTierFieldUid, read_only: false, type: 'RADIO', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: mapTier(product.family_tier) }] : []),
      // Flag products whose price was filled from category-tier medians rather
      // than real customer data, so CSMs know which to verify post-upload.
      ...(estimated ? [{ hide_field: false, hide_to_fe: true, id: 5, label: 'Price Source', read_only: true, type: 'SINGLE_LINE', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: 'Estimated (category median)' }] : []),
    ],
    option,
  }

  if (formulaUid) productObj.formula = formulaUid

  return { product: productObj, vendor: [] }
}
