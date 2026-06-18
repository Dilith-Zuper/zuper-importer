/**
 * Zuper's GET product returns nested objects — product_category and
 * location_availability[].location as {…_uid} objects, uom sometimes as an
 * object, meta_data rows with a server `_id`, formula as a nested record. Its
 * PUT endpoint wants those flattened to UID strings / the POST shape and
 * otherwise rejects the whole payload with a generic
 * "Error in Updating Product Details".
 *
 * So a GET-then-PUT update (preserve everything, change one field) can't just
 * spread the GET response back into the PUT — it must normalize first. This
 * mirrors scripts/link-accessory-formulas.mjs `toPutPayload`, which is proven to
 * round-trip a live product through PUT without data loss.
 */

type Json = Record<string, unknown>

const asObj = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null

/** Pull a UID out of a value that may be a string already or a nested object. */
export const uidOf = (v: unknown): string => {
  const o = asObj(v)
  if (o) return String(o.category_uid ?? o.location_uid ?? o.formula_uid ?? o.uid ?? '')
  return v == null ? '' : String(v)
}

export interface ZuperOptionBlock {
  customer_selection: boolean
  mandate_customer_selection: boolean
  option_label: string
  option_values: Array<{ option_value: string; option_image: string; is_available: boolean }>
}

/** Rebuild a linked formula in the embedded shape PUT expects, or drop it. */
function normalizeFormula(f: unknown): Json | undefined {
  const o = asObj(f)
  if (!o || !o.formula_uid) return undefined
  const inner = asObj(o.formula)
  return {
    formula_uid: o.formula_uid,
    formula_name: o.formula_name,
    formula_key: o.formula_key,
    ...(inner
      ? {
          formula: {
            expression: inner.expression,
            expression_map: inner.expression_map,
            rounding_mechanism: inner.rounding_mechanism,
          },
        }
      : {}),
    is_deleted: false,
  }
}

/**
 * Build a PUT-safe product object from a GET'd product, swapping in `option`
 * and preserving every other field (flattened to UID form where Zuper nests it).
 */
export function buildRemapPutProduct(
  existing: Json,
  productUid: string,
  option: ZuperOptionBlock,
): Json {
  const loc = Array.isArray(existing.location_availability) ? existing.location_availability : []
  const meta = Array.isArray(existing.meta_data) ? existing.meta_data : []

  const product: Json = {
    product_uid: productUid,
    prefix: existing.prefix ?? '',
    product_name: existing.product_name,
    product_id: existing.product_id,
    is_available: existing.is_available ?? true,
    product_category: uidOf(existing.product_category),
    price: existing.price ?? 0,
    purchase_price: existing.purchase_price ?? null,
    min_quantity: existing.min_quantity ?? 1,
    quantity: existing.quantity ?? 1,
    currency: existing.currency ?? '',
    product_manual_link: existing.product_manual_link ?? '',
    product_description: existing.product_description ?? '',
    product_image: existing.product_image ?? '',
    product_type: existing.product_type ?? 'PARTS',
    pricing_level: existing.pricing_level ?? 'ROLLUP',
    brand: existing.brand ?? '',
    track_quantity: existing.track_quantity ?? true,
    specification: existing.specification ?? '',
    has_custom_tax: existing.has_custom_tax ?? false,
    uom: typeof existing.uom === 'string' ? existing.uom : uidOf(existing.uom),
    is_billable: existing.is_billable ?? true,
    consider_profitability: existing.consider_profitability ?? true,
    is_commissionable: existing.is_commissionable ?? true,
    bu_uids: Array.isArray(existing.bu_uids)
      ? existing.bu_uids.map(uidOf).filter(Boolean)
      : (existing.bu_uids ?? null),
    location_availability: loc.map(l => {
      const o = asObj(l) ?? {}
      return {
        location: uidOf(o.location),
        min_quantity: o.min_quantity ?? 1,
        quantity: o.quantity ?? 1,
        serial_nos: Array.isArray(o.serial_nos) ? o.serial_nos : [],
      }
    }),
    tax: existing.tax ?? { tax_exempt: false, tax_name: '', tax_rate: '' },
    markup: existing.markup ?? null,
    product_files: Array.isArray(existing.product_files) ? existing.product_files : [],
    meta_data: meta.map(m => {
      const o = { ...(asObj(m) ?? {}) }
      delete o._id
      return o
    }),
    option,
  }

  const formula = normalizeFormula(existing.formula)
  if (formula) product.formula = formula
  return product
}
