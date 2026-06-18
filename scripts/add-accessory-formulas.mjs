#!/usr/bin/env node
/**
 * One-off: create CPQ formulas for the manual roofing accessories, each driven by
 * its inspection-checklist question(s). Mirrors the account's existing
 * "whirly bird vent" formula: formula_category ACCESSORY, CHECKLIST expression_map
 * entries, NEXT_WHOLE_NUMBER rounding.
 *
 * Only the 6 accessories that have a numeric count question are included — the
 * flashing/intake parts have photo-only checklist fields, so they're intentionally
 * omitted (see chat decision).
 *
 * Idempotent: skips any formula whose name or key already exists.
 *
 * Endpoint: POST {baseUrl}invoice_estimate/cpq/formulas
 *   { formula: { formula_name, formula_key, formula_category, formula_description,
 *                formula: { expression, expression_map, rounding_mechanism } } }
 *
 * Usage:
 *   ZUPER_COMPANY=roofing-golden-account ZUPER_API_KEY=xxxx node scripts/add-accessory-formulas.mjs [--dry-run]
 *   node scripts/add-accessory-formulas.mjs --company roofing-golden-account --key xxxx
 */

// checklist_uid + exact field_name for each question (from GET settings/checklist)
const cl = (field_uid, field_name) => ({ type: 'CHECKLIST', field_uid, field_name })

const FORMULAS = [
  {
    formula_name: 'Dryer Vent',
    formula_key: 'accessory_dryer_vent',
    questions: [
      cl('3b30090f-5bb8-488d-bdff-6d78554ab1be', "4'' Dryer Vents to be replaced"),
      cl('87207c1e-dc87-458a-b63b-523a7e8d8805', "6'' Dryer Vents to be replaced"),
      cl('a88b139a-c225-48c3-ab44-4c05376ef1e3', "8'' Dryer Vents to be replaced"),
    ],
  },
  {
    formula_name: 'Power Mast',
    formula_key: 'accessory_power_mast',
    questions: [cl('ee212282-092f-4726-896b-c5b0016e62ba', 'How many Power masts are present?')],
  },
  {
    formula_name: 'Versa Cap',
    formula_key: 'accessory_versa_cap',
    questions: [cl('4c5e8a42-9d55-4337-902a-ff79520c92d3', 'Count of Versa Caps')],
  },
  {
    formula_name: 'Furnace Stack',
    formula_key: 'accessory_furnace_stack',
    questions: [cl('83f5b041-c804-4b1a-a34e-67841ab09458', 'Furnace Stacks count')],
  },
  {
    formula_name: 'Satellite Dish',
    formula_key: 'accessory_satellite_dish',
    questions: [cl('90c00095-0a1b-450a-ac24-d080ae7cd0c0', 'Satellite Dishes to be Replaced')],
  },
  {
    formula_name: 'Pipeboot / Storm Collar',
    formula_key: 'accessory_pipeboot_storm_collar',
    questions: [
      cl('ba81a06e-0854-406b-aade-57f6c6c86810', "Count of 4'' Pipeboots/storm collars"),
      cl('2b10a08d-2c5c-4f7e-aefd-d96f86017af8', "Count of 6'' Pipeboots/storm collars"),
      cl('9da4b378-c346-46c5-8b60-72c897f0405e', "Count of 8'' Pipeboots/storm collars"),
      cl('565d2698-bc76-4180-99ba-136c642b7545', "Count of 10'' Pipeboots/storm collars"),
      cl('00e617bf-e3c5-48ae-984c-09999e3813ba', "Count of 12'' Pipeboots/storm collars"),
    ],
  },
]

function arg(flag) { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : undefined }
const COMPANY = arg('--company') || process.env.ZUPER_COMPANY
const API_KEY = arg('--key') || process.env.ZUPER_API_KEY
const DRY_RUN = process.argv.includes('--dry-run')
if (!COMPANY || !API_KEY) { console.error('Missing creds. Set ZUPER_COMPANY + ZUPER_API_KEY (or --company / --key).'); process.exit(1) }

const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}

// Build expression_map + expression from the question list ($1 + $2 + ...)
function build(questions) {
  const expression_map = questions.map((q, i) => ({ key: `$${i + 1}`, ...q }))
  const expression = expression_map.map(e => e.key).join(' + ')
  return { expression, expression_map }
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
  if (!verify.ok) { console.error('Invalid API key (HTTP ' + verify.status + ')'); process.exit(1) }
  console.log(`Connected to "${verify.json?.data?.company_name ?? COMPANY}" — ${baseUrl}`)

  // Existing formulas (idempotency by name + key)
  const existingNames = new Set(), existingKeys = new Set()
  let page = 1
  while (true) {
    const r = await fetchJSON(`${baseUrl}invoice_estimate/cpq/formulas?count=100&page=${page}`, { headers })
    const rows = r.json?.data ?? []
    for (const f of rows) {
      if (f.formula_name) existingNames.add(f.formula_name.toLowerCase())
      if (f.formula_key) existingKeys.add(f.formula_key)
    }
    if (rows.length < 100) break
    page++
  }

  let created = 0, skipped = 0
  const errors = []
  for (const def of FORMULAS) {
    if (existingKeys.has(def.formula_key) || existingNames.has(def.formula_name.toLowerCase())) {
      console.log(`= skip "${def.formula_name}" (already exists)`)
      skipped++
      continue
    }
    const { expression, expression_map } = build(def.questions)
    const payload = {
      formula: {
        formula_name: def.formula_name,
        formula_key: def.formula_key,
        formula_category: 'ACCESSORY',
        formula_description: '',
        formula: { expression, expression_map, rounding_mechanism: 'NEXT_WHOLE_NUMBER' },
      },
    }

    if (DRY_RUN) { console.log(`  [dry-run] "${def.formula_name}" → ${expression}  (${def.questions.map(q => q.field_name).join(' + ')})`); created++; continue }

    const r = await fetchJSON(`${baseUrl}invoice_estimate/cpq/formulas`, { method: 'POST', headers, body: JSON.stringify(payload) })
    const uid = r.json?.data?.formula_uid
    if (r.ok && (uid || r.json?.type === 'success')) {
      created++
      console.log(`+ created "${def.formula_name}" (${expression})`)
    } else {
      const msg = r.json?.message ?? JSON.stringify(r.json).slice(0, 200)
      errors.push({ name: def.formula_name, msg })
      console.error(`! failed "${def.formula_name}": ${msg}`)
    }
  }

  console.log(`\nDone${DRY_RUN ? ' (dry-run)' : ''} — created ${created}, skipped ${skipped}, errors ${errors.length}`)
  if (errors.length) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
