#!/usr/bin/env node
/**
 * Read-only probe: does the Zuper product *list* endpoint return the `option`
 * block (option_values), or is it only present on a per-product GET?
 *
 * The remap "already mapped → hide it" filter (app/api/remap/match) reads each
 * product's existing options from the list scan. If the list omits them, that
 * filter can never match and we'd need a per-product GET instead. This confirms
 * which before we trust it.
 *
 * Usage:
 *   node scripts/check-zuper-option-shape.mjs --company acme-roofing --key xxxx
 *   ZUPER_COMPANY=acme ZUPER_API_KEY=xxxx node scripts/check-zuper-option-shape.mjs
 */

function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const COMPANY = arg('--company') || process.env.ZUPER_COMPANY
const API_KEY = arg('--key') || process.env.ZUPER_API_KEY
if (!COMPANY || !API_KEY) {
  console.error('Set --company and --key (or ZUPER_COMPANY / ZUPER_API_KEY).')
  process.exit(1)
}

const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}

async function main() {
  const cfg = await getJSON('https://accounts.zuperpro.com/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ company_name: COMPANY }),
  })
  const dcApiUrl = cfg.json?.config?.dc_api_url
  if (!dcApiUrl) { console.error('Could not resolve region for company:', COMPANY); process.exit(1) }
  const baseUrl = dcApiUrl.replace(/\/?$/, '/api/')

  // Resolve the list segment the same way the app does (singular vs plural by DC).
  let seg = 'product'
  let list = await getJSON(`${baseUrl}${seg}?count=50&page=1`, { headers })
  if (list.status === 404) { seg = 'products'; list = await getJSON(`${baseUrl}${seg}?count=50&page=1`, { headers }) }

  const rows = list.json?.data ?? []
  console.log(`baseUrl: ${baseUrl}  | list segment: ${seg}  | rows on page 1: ${rows.length}`)
  if (!rows.length) { console.error('No products returned — cannot probe.'); process.exit(1) }

  // Does ANY list row carry an option block with values?
  const withOptionKey = rows.filter(r => 'option' in r).length
  const withValues = rows.filter(r => Array.isArray(r?.option?.option_values) && r.option.option_values.length > 0)
  console.log(`rows with an "option" key:            ${withOptionKey} / ${rows.length}`)
  console.log(`rows with option.option_values > 0:   ${withValues.length} / ${rows.length}`)

  const sample = withValues[0] ?? rows.find(r => 'option' in r) ?? rows[0]
  console.log('\nSample row option block (from LIST):')
  console.log(JSON.stringify(sample?.option ?? '(no "option" key on this row)', null, 2))

  // Compare against the per-product GET for the same product.
  const uid = sample?.product_uid
  if (uid) {
    const g = await getJSON(`${baseUrl}product/${uid}`, { headers })
    const data = Array.isArray(g.json?.data) ? g.json.data[0] : g.json?.data
    console.log(`\nSame product via GET product/${uid} — option block:`)
    console.log(JSON.stringify(data?.option ?? '(no option on GET either)', null, 2))
  }

  console.log('\n→ Verdict:', withValues.length > 0
    ? 'LIST returns options — the remap skip filter works as written.'
    : 'LIST does NOT return populated options — the skip filter needs a per-product GET (tell Claude).')
}

main().catch(e => { console.error(e); process.exit(1) })
