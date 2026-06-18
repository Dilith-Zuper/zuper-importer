#!/usr/bin/env node
/**
 * One-off: add ~12 manual roofing-accessory PARTS to a Zuper account.
 *
 * Reuses the same API contract as the wizard's upload flow:
 *   resolve base URL → match/create category → find warehouse → POST {baseUrl}product
 *
 * Idempotent: skips any accessory whose product_name already exists in the account,
 * so re-running won't create duplicates. Categories are matched case-insensitively
 * against existing ones and only created when missing.
 *
 * Usage:
 *   ZUPER_COMPANY=acme-roofing ZUPER_API_KEY=xxxx node scripts/add-accessories.mjs
 *   node scripts/add-accessories.mjs --company acme-roofing --key xxxx
 *   add --dry-run to preview without writing.
 */

// ── Accessory definitions ──────────────────────────────────────────────────────
// price is a BALLPARK estimate — flagged with a meta_data note so CSMs verify it.
const ACCESSORIES = [
  { name: 'Dryer Vent',              category: 'Ventilation', uom: 'EA', price: 45,   desc: 'Roof-mounted dryer exhaust vent with backdraft damper' },
  { name: 'Power Mast',             category: 'Flashing',    uom: 'EA', price: 40,   desc: 'Electrical service mast flashing/boot for roof penetration' },
  { name: 'Versa Cap',             category: 'Ventilation', uom: 'EA', price: 35,   desc: 'Retrofit all-flash vent cap for plumbing/exhaust stacks' },
  { name: 'Furnace Stack',         category: 'Ventilation', uom: 'EA', price: 55,   desc: 'B-vent furnace stack flashing and storm collar' },
  { name: 'Satellite Dish',        category: 'Accessories', uom: 'EA', price: 25,   desc: 'Satellite dish mount removal/reset accessory' },
  { name: 'Step Flashing',         category: 'Flashing',    uom: 'LF', price: 2.5,  desc: 'Galvanized/aluminum sidewall step flashing' },
  { name: 'Headwall Flashing',     category: 'Flashing',    uom: 'LF', price: 4,    desc: 'Headwall/apron flashing' },
  { name: 'Valley Flashing',       category: 'Flashing',    uom: 'LF', price: 5,    desc: 'Open valley metal flashing' },
  { name: 'Transition Flashing',   category: 'Flashing',    uom: 'LF', price: 5,    desc: 'Roof-to-roof pitch transition flashing' },
  { name: 'Kickout Flashing',      category: 'Flashing',    uom: 'EA', price: 12,   desc: 'Kickout/diverter flashing at roof-wall terminations' },
  { name: 'Pipeboot / Storm Collar', category: 'Flashing',  uom: 'EA', price: 18,   desc: 'Pipe boot with storm collar for plumbing vent penetrations' },
  { name: 'Intake Venting',        category: 'Ventilation', uom: 'LF', price: 6,    desc: 'Intake/soffit ventilation' },
]

// ── Args / creds ───────────────────────────────────────────────────────────────
function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const COMPANY = arg('--company') || process.env.ZUPER_COMPANY
const API_KEY = arg('--key') || process.env.ZUPER_API_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!COMPANY || !API_KEY) {
  console.error('Missing creds. Set ZUPER_COMPANY + ZUPER_API_KEY (or pass --company / --key).')
  process.exit(1)
}

const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}

async function main() {
  // 1. Resolve base URL from company login (same as /api/connect)
  const cfg = await fetchJSON('https://accounts.zuperpro.com/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ company_name: COMPANY }),
  })
  const dcApiUrl = cfg.json?.config?.dc_api_url
  if (!dcApiUrl) { console.error('Could not resolve region for company:', COMPANY); process.exit(1) }
  const baseUrl = dcApiUrl.replace(/\/?$/, '/api/')

  // Verify key
  const verify = await fetchJSON(`${baseUrl}user/company`, { headers })
  if (!verify.ok) { console.error('Invalid API key (HTTP ' + verify.status + ')'); process.exit(1) }
  const companyName = verify.json?.data?.company_name ?? COMPANY
  console.log(`Connected to "${companyName}" — ${baseUrl}`)

  // 2. Warehouse location
  const locRes = await fetchJSON(`${baseUrl}products/location?count=100&page=1`, { headers })
  const warehouse = (locRes.json?.data ?? []).find(l => l.location_type === 'WAREHOUSE' && !l.is_deleted)
  if (!warehouse) { console.error('No WAREHOUSE location found — create one in the account first.'); process.exit(1) }
  const warehouseUid = warehouse.location_uid
  console.log(`Warehouse: ${warehouse.location_name ?? 'Warehouse'} (${warehouseUid.slice(0, 8)}…)`)

  // 3. Existing categories (match case-insensitively, create when missing)
  const catMap = {} // lowercased name → uid
  let page = 1
  while (true) {
    const r = await fetchJSON(`${baseUrl}products/category?count=100&page=${page}`, { headers })
    const rows = r.json?.data ?? []
    for (const c of rows) {
      if (c.is_deleted) continue
      const uid = c.category_uid ?? c.product_category_uid ?? c.uid
      if (uid && c.category_name) catMap[c.category_name.toLowerCase()] = uid
    }
    if (rows.length < 100) break
    page++
  }

  async function ensureCategory(name) {
    const existing = catMap[name.toLowerCase()]
    if (existing) return existing
    if (DRY_RUN) { console.log(`  [dry-run] would create category "${name}"`); return 'DRY_RUN_CAT' }
    const r = await fetchJSON(`${baseUrl}products/category`, {
      method: 'POST', headers,
      body: JSON.stringify({ product_category: { category_name: name, category_description: '', bu_uids: [], parent_category_uid: null } }),
    })
    const uid = r.json?.data?.category_uid ?? r.json?.data?.product_category_uid
    if (!uid) throw new Error(`Failed to create category "${name}": ${JSON.stringify(r.json).slice(0, 200)}`)
    catMap[name.toLowerCase()] = uid
    console.log(`  + created category "${name}"`)
    return uid
  }

  // 4. Existing product names (idempotency) — list endpoint is singular or plural by DC
  const existingNames = new Set()
  for (const seg of ['product', 'products']) {
    let p = 1, ok = false
    while (true) {
      const r = await fetchJSON(`${baseUrl}${seg}?count=100&page=${p}`, { headers })
      if (r.status === 404) break
      ok = true
      const rows = r.json?.data ?? []
      for (const row of rows) if (row.product_name) existingNames.add(row.product_name.toLowerCase())
      if (rows.length < 100) break
      p++
    }
    if (ok) break
  }

  // 5. Create each accessory
  let created = 0, skipped = 0
  const errors = []
  for (const a of ACCESSORIES) {
    if (existingNames.has(a.name.toLowerCase())) {
      console.log(`= skip "${a.name}" (already exists)`)
      skipped++
      continue
    }
    const categoryUid = await ensureCategory(a.category)
    const payload = {
      product: {
        prefix: '',
        product_name: a.name,
        is_available: true,
        product_category: categoryUid,
        price: a.price,
        purchase_price: null,
        min_quantity: 1,
        quantity: 1,
        currency: '',
        product_manual_link: '',
        product_description: `<p>${a.desc}</p>`,
        product_image: '',
        product_type: 'PARTS',
        pricing_level: 'ROLLUP',
        brand: '',
        track_quantity: true,
        specification: '',
        has_custom_tax: false,
        uom: a.uom,
        is_billable: true,
        consider_profitability: true,
        is_commissionable: true,
        bu_uids: null,
        location_availability: [{ location: warehouseUid, min_quantity: 1, quantity: 1, serial_nos: [] }],
        tax: { tax_exempt: false, tax_name: '', tax_rate: '' },
        markup: null,
        product_files: [],
        meta_data: [
          { hide_field: false, hide_to_fe: true, id: 0, label: 'Price Source', read_only: true, type: 'SINGLE_LINE', dependent_on: '', dependent_options: [], module_name: 'PRODUCT', value: 'Ballpark estimate — verify price' },
        ],
      },
      vendor: [],
    }

    if (DRY_RUN) { console.log(`  [dry-run] would create "${a.name}" → ${a.category} / ${a.uom} / $${a.price}`); created++; continue }

    const r = await fetchJSON(`${baseUrl}product`, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (r.ok && (r.json?.type === 'success' || r.json?.data)) {
      created++
      console.log(`+ created "${a.name}"`)
    } else {
      const msg = r.json?.message ?? JSON.stringify(r.json).slice(0, 200)
      errors.push({ name: a.name, msg })
      console.error(`! failed "${a.name}": ${msg}`)
    }
  }

  console.log(`\nDone${DRY_RUN ? ' (dry-run)' : ''} — created ${created}, skipped ${skipped}, errors ${errors.length}`)
  if (errors.length) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
