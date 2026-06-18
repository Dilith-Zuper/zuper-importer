#!/usr/bin/env node
/**
 * Clone a CPQ proposal template and add an "Accessories" section containing the
 * accessory parts that have a CPQ formula.
 *
 * Strategy mirrors app/api/create-proposals/route.ts (the proven build path):
 *   POST template → POST options (Good/Better/Best) → PUT config →
 *   per option: replay source sections/items, then add the Accessories section.
 *
 * The clone is created as a DRAFT with NO trigger — the source template triggers
 * on Inspection → Create Proposal, and two CPQ templates on the same trigger
 * collide. Set the trigger in the UI when ready to use the clone.
 *
 * Accessories included = the 6 parts that have a formula (Dryer Vent, Power Mast,
 * Versa Cap, Furnace Stack, Satellite Dish, Pipeboot / Storm Collar). Matched to
 * their product + formula by name.
 *
 * Idempotent-ish: aborts if a template with the target name already exists.
 *
 * Usage:
 *   ZUPER_COMPANY=roofing-golden-account ZUPER_API_KEY=xxxx \
 *     node scripts/clone-template-add-accessories.mjs [--source <uid>] [--dry-run]
 */

const SOURCE_UID_DEFAULT = '48ea7a60-e6ef-4219-aab6-6726853b0d82'
const ACCESSORY_SECTION = 'Accessories'
const ACCESSORY_PARTS = [
  'Dryer Vent', 'Power Mast', 'Versa Cap', 'Furnace Stack', 'Satellite Dish', 'Pipeboot / Storm Collar',
]

function arg(flag) { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : undefined }
const COMPANY = arg('--company') || process.env.ZUPER_COMPANY
const API_KEY = arg('--key') || process.env.ZUPER_API_KEY
const SOURCE_UID = arg('--source') || SOURCE_UID_DEFAULT
const DRY_RUN = process.argv.includes('--dry-run')
if (!COMPANY || !API_KEY) { console.error('Missing creds. Set ZUPER_COMPANY + ZUPER_API_KEY.'); process.exit(1) }

const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}
const headerData = (r) => { const d = r.json?.data; return Array.isArray(d) ? d[0] : d }
const secUidOf = (h) => h?.section_uid ?? h?.line_item_uid ?? h?.uid ?? ''

// Split a flat line_items list into ordered sections [{header, items}]
function toSections(lineItems) {
  const sections = []
  let cur = null
  for (const x of lineItems) {
    if (x.line_item_type === 'HEADER') {
      cur = { header: x, items: [] }
      sections.push(cur)
    } else if (cur) {
      cur.items.push(x)
    }
  }
  return sections
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

  // Source template
  const src = headerData(await fetchJSON(`${baseUrl}invoice_estimate/proposal_template/${SOURCE_UID}`, { headers }))
  if (!src) { console.error('Source template not found'); process.exit(1) }
  const targetName = `${src.template_name} (Clone + Accessories)`
  console.log(`Source: "${src.template_name}" — ${src.proposal_options.length} options`)
  console.log(`Target: "${targetName}"`)

  // Abort if target already exists
  let tp = 1, exists = false
  while (true) {
    const r = await fetchJSON(`${baseUrl}invoice_estimate/proposal_template?count=100&page=${tp}`, { headers })
    const rows = r.json?.data ?? []
    if (rows.some(t => t.template_name === targetName)) { exists = true; break }
    if (rows.length < 100) break
    tp++
  }
  if (exists) { console.error(`A template named "${targetName}" already exists — aborting to avoid a duplicate clone.`); process.exit(1) }

  // Resolve accessory product_uid + formula_uid by name
  const productUidByName = {}, formulaUidByName = {}
  let pp = 1
  while (true) {
    const r = await fetchJSON(`${baseUrl}product?count=100&page=${pp}`, { headers })
    const rows = r.json?.data ?? []
    for (const row of rows) if (row.product_name) productUidByName[row.product_name.toLowerCase()] = row.product_uid
    if (rows.length < 100) break
    pp++
  }
  let fp = 1
  while (true) {
    const r = await fetchJSON(`${baseUrl}invoice_estimate/cpq/formulas?count=100&page=${fp}`, { headers })
    const rows = r.json?.data ?? []
    for (const f of rows) if (f.formula_name) formulaUidByName[f.formula_name.toLowerCase()] = f.formula_uid
    if (rows.length < 100) break
    fp++
  }
  const accessoryItems = ACCESSORY_PARTS.map(name => ({
    name,
    product_uid: productUidByName[name.toLowerCase()],
    formula_uid: formulaUidByName[name.toLowerCase()],
  }))
  const missing = accessoryItems.filter(a => !a.product_uid || !a.formula_uid)
  if (missing.length) { console.error('Missing product/formula for:', missing.map(m => m.name)); process.exit(1) }
  console.log(`Accessories to add: ${accessoryItems.map(a => a.name).join(', ')}`)

  if (DRY_RUN) {
    console.log('\n[dry-run] Would clone the template and, per option, replay sections then insert:')
    console.log(`  HEADER "${ACCESSORY_SECTION}"`)
    for (const a of accessoryItems) console.log(`    ITEM ${a.name} (product ${a.product_uid.slice(0,8)}…, formula ${a.formula_uid.slice(0,8)}…)`)
    console.log('\n[dry-run] no writes made.')
    return
  }

  // 1. Create template
  const created = await fetchJSON(`${baseUrl}invoice_estimate/proposal_template`, {
    method: 'POST', headers,
    body: JSON.stringify({ proposal_template: { template_name: targetName, template_description: src.template_description ?? '', template_type: 'CPQ' } }),
  })
  const newUid = created.json?.data?.template_uid
  if (!newUid) { console.error('Failed to create template:', JSON.stringify(created.json).slice(0, 300)); process.exit(1) }
  console.log(`+ created template ${newUid}`)

  // 2. Create options matching source (name + is_recommended)
  const optRes = await fetchJSON(`${baseUrl}invoice_estimate/proposal_template/${newUid}/options?items_type=LINE_ITEMS`, {
    method: 'POST', headers,
    body: JSON.stringify({
      proposal_options: src.proposal_options.map(o => ({
        option_name: o.option_name, option_description: o.option_description ?? '', option_image: o.option_image ?? '', promo: '', is_recommended: !!o.is_recommended,
      })),
    }),
  })
  const newOptions = optRes.json?.data ?? []
  if (!newOptions.length) { console.error('Failed to create options:', JSON.stringify(optRes.json).slice(0, 300)); process.exit(1) }
  const newOptUidByName = {}
  for (const o of newOptions) newOptUidByName[o.option_name] = o.option_uid

  // 3. PUT config — layout + draft, NO trigger
  await fetchJSON(`${baseUrl}invoice_estimate/proposal_template/${newUid}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ proposal_template: {
      template_name: targetName, template_description: src.template_description ?? '', template_type: 'CPQ', template_uid: newUid,
      ...(src.layout_template_uid ? { layout_template_uid: src.layout_template_uid } : {}),
      is_draft: true,
    } }),
  })

  // 4. Per option: replay sections (with Accessories inserted after Material)
  let totalItems = 0
  for (const srcOpt of src.proposal_options) {
    const optUid = newOptUidByName[srcOpt.option_name]
    if (!optUid) { console.error(`No new option for "${srcOpt.option_name}" — skipping`); continue }
    const url = `${baseUrl}invoice_estimate/proposal_template/${newUid}/options/${optUid}/line_items?items_type=LINE_ITEMS`

    const sections = toSections(srcOpt.line_items)
    // Build accessories section
    const accSection = {
      header: { product_name: ACCESSORY_SECTION, section_type: 'EXPANDED', show_section_total: false, show_child_prices: true },
      items: accessoryItems.map(a => ({
        line_item_type: 'ITEM', product_name: a.name,
        product: { product_uid: a.product_uid, product_type: 'PARTS' },
        formula: { formula_uid: a.formula_uid },
      })),
    }
    // Insert after the "Material" section (else append at end)
    const matIdx = sections.findIndex(s => (s.header.product_name || '').toLowerCase() === 'material')
    if (matIdx >= 0) sections.splice(matIdx + 1, 0, accSection)
    else sections.push(accSection)

    for (const sec of sections) {
      const hName = sec.header.product_name
      const hdrRes = await fetchJSON(url, {
        method: 'POST', headers,
        body: JSON.stringify({ line_item: {
          type: 'HEADER', line_item_type: 'HEADER', product_name: hName,
          section_type: sec.header.section_type ?? 'EXPANDED',
          show_section_total: sec.header.show_section_total ?? false,
          show_child_prices: sec.header.show_child_prices ?? true,
        } }),
      })
      const sectionUid = secUidOf(headerData(hdrRes))

      for (const it of sec.items) {
        const productUid = (it.product || {}).product_uid
        if (!productUid) continue
        const productType = (it.product || {}).product_type || 'PARTS'
        const formulaUid = (it.formula || {}).formula_uid
        const body = { line_item: {
          type: 'ITEM', line_item_type: 'ITEM', product_name: it.product_name,
          product: productUid, product_type: productType, quantity: 1,
          ...(formulaUid ? { quantity_type: 'FORMULA', formula: formulaUid } : { quantity_type: 'FIXED' }),
          ...(sectionUid ? { section_uid: sectionUid, section_name: hName } : {}),
        } }
        const r = await fetchJSON(url, { method: 'POST', headers, body: JSON.stringify(body) })
        if (!r.ok && formulaUid) {
          // retry FIXED if formula rejected
          await fetchJSON(url, { method: 'POST', headers, body: JSON.stringify({ line_item: { ...body.line_item, quantity_type: 'FIXED', formula: undefined } }) })
        }
        totalItems++
      }
      console.log(`  [${srcOpt.option_name}] section "${hName}" — ${sec.items.length} items`)
    }
  }

  // 5. Verify
  const check = headerData(await fetchJSON(`${baseUrl}invoice_estimate/proposal_template/${newUid}`, { headers }))
  console.log('\nVerification:')
  for (const o of check.proposal_options ?? []) {
    const secs = toSections(o.line_items)
    const acc = secs.find(s => (s.header.product_name || '').toLowerCase() === ACCESSORY_SECTION.toLowerCase())
    console.log(`  ${o.option_name}: ${o.line_items.length} line items | Accessories section: ${acc ? acc.items.length + ' items' : 'MISSING'}`)
  }
  console.log(`\nDone — new template "${targetName}" (${newUid}), ~${totalItems} items posted. Created as DRAFT, no trigger.`)
}

main().catch(e => { console.error(e); process.exit(1) })
