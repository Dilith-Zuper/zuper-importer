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
) {
  // Deduplicate colors — exclude N/A and blanks
  const colors = Array.from(new Set(
    variants
      .map(v => v.color_name?.trim())
      .filter((c): c is string => !!c && c !== 'N/A' && c.toLowerCase() !== 'na')
  ))

  const cappedColors = colors.slice(0, 50)

  // Shingles have genuine color choices the customer must pick.
  // Everything else (nails/fasteners → "Mill", accessories → size codes) is
  // a variant label, not a customer-facing selection.
  const isShingles = product.product_category === 'SHINGLES'

  const option = cappedColors.length > 0 ? {
    customer_selection: isShingles,
    mandate_customer_selection: isShingles,
    option_label: isShingles ? 'Color' : 'Variant',
    option_values: cappedColors.map(c => ({
      option_value: c,
      option_image: '',
      is_available: true,
    })),
  } : {
    customer_selection: false,
    mandate_customer_selection: false,
    option_label: 'Color',
    option_values: [],
  }

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
    uom: toZuperUom(product.product_uom),
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
