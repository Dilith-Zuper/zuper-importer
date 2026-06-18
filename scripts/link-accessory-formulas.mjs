#!/usr/bin/env node
/**
 * One-off: link each accessory PRODUCT to its matching CPQ formula so the quote
 * auto-computes quantity from the inspection checklist.
 *
 * Matches product ↔ formula by identical name (Dryer Vent, Power Mast, Versa Cap,
 * Furnace Stack, Satellite Dish, Pipeboot / Storm Collar).
 *
 * Update path: PUT {baseUrl}product/{product_uid} with the full product object.
 * Zuper's GET returns nested objects (product_category, location_availability.location)
 * that PUT wants as UID strings — so we GET the live product, normalize it back to
 * the POST shape, set `formula`, and PUT. This preserves every existing field
 * (price, description, options) for products we didn't create here.
 *
 * Idempotent: skips a product whose `formula` already equals the target UID.
 * Verifies each link with a follow-up GET.
 *
 * Usage:
 *   ZUPER_COMPANY=roofing-golden-account ZUPER_API_KEY=xxxx node scripts/link-accessory-formulas.mjs [--dry-run]
 */

const PARTS = [
  'Dryer Vent',
  'Power Mast',
  'Versa Cap',
  'Furnace Stack',
  'Satellite Dish',
  'Pipeboot / Storm Collar',
]

function arg(flag) { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : undefined }
const COMPANY = arg('--company') || process.env.ZUPER_COMPANY
const API_KEY = arg('--key') || process.env.ZUPER_API_KEY
const DRY_RUN = process.argv.includes('--dry-run')
if (!COMPANY || !API_KEY) { console.error('Missing creds. Set ZUPER_COMPANY + ZUPER_API_KEY.'); process.exit(1) }

const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}
const uidOf = (v) => (v && typeof v === 'object') ? (v.category_uid ?? v.location_uid ?? v.formula_uid ?? v.uid ?? '') : (v ?? '')

// Build the embedded formula object the product expects (matches how Zuper
// stores a linked formula: formula_uid + name + key + nested formula{}).
function embedFormula(f) {
  return {
    formula_uid: f.formula_uid,
    formula_name: f.formula_name,
    formula_key: f.formula_key,
    formula: {
      expression: f.formula?.expression,
      expression_map: f.formula?.expression_map,
      rounding_mechanism: f.formula?.rounding_mechanism,
    },
    is_deleted: false,
  }
}

// Normalize a GET product into the PUT/POST shape, with `formula` set.
function toPutPayload(p, formulaObj) {
  return {
    product: {
      product_uid: p.product_uid,
      prefix: p.prefix ?? '',
      product_name: p.product_name,
      product_id: p.product_id,
      is_available: p.is_available ?? true,
      product_category: uidOf(p.product_category),
      price: p.price ?? 0,
      purchase_price: p.purchase_price ?? null,
      min_quantity: p.min_quantity ?? 1,
      quantity: p.quantity ?? 1,
      currency: p.currency ?? '',
      product_manual_link: p.product_manual_link ?? '',
      product_description: p.product_description ?? '',
      product_image: p.product_image ?? '',
      product_type: p.product_type ?? 'PARTS',
      pricing_level: p.pricing_level ?? 'ROLLUP',
      brand: p.brand ?? '',
      track_quantity: p.track_quantity ?? true,
      specification: p.specification ?? '',
      has_custom_tax: p.has_custom_tax ?? false,
      uom: typeof p.uom === 'string' ? p.uom : uidOf(p.uom),
      is_billable: p.is_billable ?? true,
      consider_profitability: p.consider_profitability ?? true,
      is_commissionable: p.is_commissionable ?? true,
      location_availability: (p.location_availability ?? []).map(l => ({
        location: uidOf(l.location),
        min_quantity: l.min_quantity ?? 1,
        quantity: l.quantity ?? 1,
        serial_nos: l.serial_nos ?? [],
      })),
      tax: p.tax ?? { tax_exempt: false },
      product_files: p.product_files ?? [],
      meta_data: (p.meta_data ?? []).map(({ _id, ...rest }) => rest),
      option: p.option ?? { option_label: 'Option', customer_selection: false, mandate_customer_selection: false, option_values: [] },
      formula: formulaObj,
    },
  }
}

async function main() {
  const cfg = await fetchJSON('https://accounts.zuperpro.com/api/config', {
    method: 'POST', headers: { 'content-type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ company_name: COMPANY }),
  })
  const dcApiUrl = cfg.json?.config?.dc_api_url
  if (!dcApiUrl) { console.error('Could not resolve region for company:', COMPANY); process.exit(1) }
  const baseUrl = dcApiUrl.replace(/\/?$/, '/api/')
  const verify = await fetchJSON(`${baseUrl}user/company`, { headers })
  if (!verify.ok) { console.error('Invalid API key'); process.exit(1) }
  console.log(`Connected to "${verify.json?.data?.company_name ?? COMPANY}" — ${baseUrl}`)

  // formula name -> full record
  const formulaByName = {}
  let fp = 1
  while (true) {
    const r = await fetchJSON(`${baseUrl}invoice_estimate/cpq/formulas?count=100&page=${fp}`, { headers })
    const rows = r.json?.data ?? []
    for (const f of rows) if (f.formula_name) formulaByName[f.formula_name.toLowerCase()] = f
    if (rows.length < 100) break
    fp++
  }

  // product name -> uid (search all pages)
  const productUidByName = {}
  let pp = 1
  while (true) {
    const r = await fetchJSON(`${baseUrl}product?count=100&page=${pp}`, { headers })
    const rows = r.json?.data ?? []
    for (const row of rows) if (row.product_name) productUidByName[row.product_name.toLowerCase()] = row.product_uid
    if (rows.length < 100) break
    pp++
  }

  let linked = 0, skipped = 0
  const errors = []
  for (const name of PARTS) {
    const productUid = productUidByName[name.toLowerCase()]
    const formulaRec = formulaByName[name.toLowerCase()]
    const formulaUid = formulaRec?.formula_uid
    if (!productUid) { errors.push({ name, msg: 'product not found' }); console.error(`! "${name}": product not found`); continue }
    if (!formulaUid) { errors.push({ name, msg: 'formula not found' }); console.error(`! "${name}": formula not found`); continue }

    const getRes = await fetchJSON(`${baseUrl}product/${productUid}`, { headers })
    let p = getRes.json?.data
    if (Array.isArray(p)) p = p[0]
    if (!p) { errors.push({ name, msg: 'GET failed' }); console.error(`! "${name}": GET failed`); continue }

    if (uidOf(p.formula) === formulaUid) { console.log(`= skip "${name}" (already linked)`); skipped++; continue }

    if (DRY_RUN) { console.log(`  [dry-run] would link "${name}" product ${productUid.slice(0, 8)}… → formula ${formulaUid.slice(0, 8)}…`); linked++; continue }

    const payload = toPutPayload(p, embedFormula(formulaRec))
    const r = await fetchJSON(`${baseUrl}product/${productUid}`, { method: 'PUT', headers, body: JSON.stringify(payload) })
    if (!r.ok && r.json?.type !== 'success') {
      const msg = r.json?.message ?? JSON.stringify(r.json).slice(0, 200)
      errors.push({ name, msg }); console.error(`! "${name}" PUT failed: ${msg}`); continue
    }

    // verify
    const v = await fetchJSON(`${baseUrl}product/${productUid}`, { headers })
    let vp = v.json?.data; if (Array.isArray(vp)) vp = vp[0]
    const okFormula = uidOf(vp?.formula) === formulaUid
    const okName = vp?.product_name === p.product_name
    const okPrice = vp?.price === p.price
    if (okFormula && okName && okPrice) {
      linked++
      console.log(`+ linked "${name}" → formula ${formulaUid.slice(0, 8)}…  (price ${vp.price}, category preserved)`)
    } else {
      errors.push({ name, msg: `verify mismatch formula=${okFormula} name=${okName} price=${okPrice}` })
      console.error(`! "${name}" verify mismatch: formula=${okFormula} name=${okName} price=${okPrice}`)
    }
  }

  console.log(`\nDone${DRY_RUN ? ' (dry-run)' : ''} — linked ${linked}, skipped ${skipped}, errors ${errors.length}`)
  if (errors.length) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
