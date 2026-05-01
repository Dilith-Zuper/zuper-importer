import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchWithRetry, zuperHeaders, bestZuperMatch, type ZuperToken } from '@/lib/zuper-fetch'
import { REQUIRED_TOKENS } from '@/lib/token-definitions'
import { FORMULA_DEFINITIONS } from '@/lib/formula-definitions'
import { UOM_MAP } from '@/lib/uom-map'
import type { TokenInfo } from '@/types/wizard'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { baseUrl, apiKey, productIds } = await req.json() as {
    baseUrl: string
    apiKey: string
    productIds: number[]
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        // ── Fetch products needed ──────────────────────────────────────────────
        const { data: products, error: pErr } = await supabase
          .from('srs_products')
          .select('product_id, product_category')
          .in('product_id', productIds)
        if (pErr) throw new Error(pErr.message)

        const requiredCategories = Array.from(new Set(products.map(p => p.product_category as string)))

        // ── Check 1: Categories ───────────────────────────────────────────────
        enqueue({ check: 'categories', status: 'running', detail: 'Fetching existing categories…' })
        const categoryMap: Record<string, string> = {}
        try {
          let allCats: { category_name: string; category_uid?: string; product_category_uid?: string; uid?: string; is_deleted?: boolean }[] = []
          let page = 1
          while (true) {
            const r = await fetchWithRetry(`${baseUrl}products/category?count=100&page=${page}`, { headers: zuperHeaders(apiKey) })
            const rows = r.json?.data ?? []
            allCats.push(...rows)
            if (allCats.length >= (r.json?.total_records ?? 0) || rows.length < 100) break
            page++
          }
          const existing: Record<string, string> = {}
          for (const c of allCats.filter(c => !c.is_deleted)) {
            const uid = c.category_uid ?? c.product_category_uid ?? c.uid ?? ''
            if (uid) existing[c.category_name.toLowerCase()] = uid
          }

          let created = 0
          for (const catName of requiredCategories) {
            if (existing[catName.toLowerCase()]) {
              categoryMap[catName] = existing[catName.toLowerCase()]
            } else {
              const r = await fetchWithRetry(`${baseUrl}products/category`, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify({ product_category: { category_name: catName, category_description: '', bu_uids: [], parent_category_uid: null } }),
              })
              const uid = r.json?.data?.category_uid ?? r.json?.data?.product_category_uid
              if (!uid) throw new Error(`Failed to create category: ${catName}`)
              categoryMap[catName] = uid
              created++
            }
          }
          enqueue({ check: 'categories', status: 'pass', detail: `${requiredCategories.length} categories ready (${created} created)` })
        } catch (e: unknown) {
          enqueue({ check: 'categories', status: 'fail', detail: (e as Error).message })
          controller.close(); return
        }

        // ── Check 2: Warehouse ────────────────────────────────────────────────
        enqueue({ check: 'warehouse', status: 'running', detail: 'Checking warehouse location…' })
        let warehouseUid = ''
        try {
          const r = await fetchWithRetry(`${baseUrl}products/location?count=100&page=1`, { headers: zuperHeaders(apiKey) })
          const loc = (r.json?.data ?? []).find((l: { location_type: string; is_deleted: boolean; location_uid: string }) => l.location_type === 'WAREHOUSE' && !l.is_deleted)
          if (loc) {
            warehouseUid = loc.location_uid
            enqueue({ check: 'warehouse', status: 'pass', detail: `Using existing "${loc.location_name ?? 'Warehouse'}" (${warehouseUid.slice(0, 8)}…)` })
          } else {
            const cr = await fetchWithRetry(`${baseUrl}products/location`, {
              method: 'POST',
              headers: zuperHeaders(apiKey),
              body: JSON.stringify({ product_location: { location_access: 'ALL', location_name: 'Warehouse', location_type: 'WAREHOUSE', location_description: '', location_address: { city: '', street: '', country: '', state: '', zip_code: '', geo_cordinates: [0, 0] }, allowed_users: [] } }),
            })
            warehouseUid = cr.json?.data?.location_uid
            if (!warehouseUid) throw new Error('Failed to create warehouse location')
            enqueue({ check: 'warehouse', status: 'pass', detail: 'Created new warehouse location' })
          }
        } catch (e: unknown) {
          enqueue({ check: 'warehouse', status: 'fail', detail: (e as Error).message })
          controller.close(); return
        }

        // ── Check 3: Measurement Tokens ───────────────────────────────────────
        enqueue({ check: 'tokens', status: 'running', detail: 'Checking measurement tokens…' })
        const tokenMap: Record<string, TokenInfo> = {}
        try {
          const catRes = await fetchWithRetry(`${baseUrl}measurements/categories?sort=ASC&sort_by=created_at`, { headers: zuperHeaders(apiKey) })
          const measCategories: { measurement_category_uid: string; measurement_category_name: string; measurement_tokens?: { measurement_token_uid: string; measurement_token_name: string; uom?: string }[] }[] = catRes.json?.data ?? []

          const allTokens: ZuperToken[] = []
          for (const cat of measCategories) {
            for (const tok of cat.measurement_tokens ?? []) {
              allTokens.push({ ...tok, categoryUid: cat.measurement_category_uid })
            }
          }

          for (const required of REQUIRED_TOKENS) {
            const match = bestZuperMatch(required.name, allTokens)
            if (match) tokenMap[required.name] = { measurement_token_uid: match.uid, measurement_category_uid: match.categoryUid }
          }

          const missing = REQUIRED_TOKENS.filter(t => !tokenMap[t.name])
          if (missing.length > 0) {
            let roofCatUid = measCategories.find(c => c.measurement_category_name?.toLowerCase() === 'roof measurements')?.measurement_category_uid ?? ''
            if (!roofCatUid) {
              const cr = await fetchWithRetry(`${baseUrl}measurements/categories`, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify({ measurement_category: { measurement_category_name: 'Roof Measurements' } }),
              })
              roofCatUid = cr.json?.data?.measurement_category_uid ?? ''
              if (!roofCatUid) {
                const listRes = await fetchWithRetry(`${baseUrl}measurements/categories?sort=ASC&sort_by=created_at`, { headers: zuperHeaders(apiKey) })
                roofCatUid = (listRes.json?.data ?? []).find((c: { measurement_category_name: string; measurement_category_uid: string }) => c.measurement_category_name?.toLowerCase() === 'roof measurements')?.measurement_category_uid ?? ''
              }
              if (!roofCatUid) throw new Error('Failed to find or create Roof Measurements category')
            }

            for (const token of missing) {
              const r = await fetchWithRetry(`${baseUrl}measurements/categories/${roofCatUid}/tokens`, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify({ measurement_token: { measurement_token_name: token.name, uom: token.uom } }),
              })
              const uid = r.json?.data?.measurement_token_uid
              if (!uid) throw new Error(`Failed to create token: ${token.name}`)
              tokenMap[token.name] = { measurement_token_uid: uid, measurement_category_uid: roofCatUid }
            }
          }

          enqueue({ check: 'tokens', status: 'pass', detail: `${REQUIRED_TOKENS.length} tokens ready (${missing?.length ?? 0} created)` })
        } catch (e: unknown) {
          enqueue({ check: 'tokens', status: 'fail', detail: (e as Error).message })
          controller.close(); return
        }

        // ── Check 4: CPQ Formulas ─────────────────────────────────────────────
        enqueue({ check: 'formulas', status: 'running', detail: 'Checking CPQ formulas…' })
        const formulaMap: Record<string, string> = {}
        try {
          let formulaPage = 1
          const existingByKey: Record<string, string> = {}
          const existingByName: Record<string, string> = {}
          while (true) {
            const r = await fetchWithRetry(`${baseUrl}invoice_estimate/cpq/formulas?count=100&page=${formulaPage}`, { headers: zuperHeaders(apiKey) })
            const rows: { formula_key: string; formula_name: string; formula_uid: string }[] = r.json?.data ?? []
            for (const f of rows) {
              if (f.formula_key) existingByKey[f.formula_key] = f.formula_uid
              if (f.formula_name) existingByName[f.formula_name] = f.formula_uid
            }
            if (rows.length < 100) break
            formulaPage++
          }
          Object.assign(formulaMap, existingByKey)

          let created = 0
          for (const def of FORMULA_DEFINITIONS) {
            if (existingByKey[def.formula_key] || existingByName[def.formula_name]) {
              formulaMap[def.formula_key] = existingByKey[def.formula_key] ?? existingByName[def.formula_name]
              continue
            }

            const expression_map = def.expression_map.map((entry, idx) => {
              const key = `$${idx + 1}`
              if (entry.type === 'CONSTANT') return { key, type: 'CONSTANT', value: entry.value }
              const tokenInfo = tokenMap[entry.field_name]
              if (!tokenInfo) throw new Error(`Token missing from tokenMap: ${entry.field_name}`)
              return { key, type: 'MEASUREMENT', field_name: entry.field_name, measurement_token_uid: tokenInfo.measurement_token_uid, measurement_category_uid: tokenInfo.measurement_category_uid }
            })

            const r = await fetchWithRetry(`${baseUrl}invoice_estimate/cpq/formulas`, {
              method: 'POST',
              headers: zuperHeaders(apiKey),
              body: JSON.stringify({
                formula: {
                  formula_name: def.formula_name,
                  formula_key: def.formula_key,
                  formula_category: 'AREA_MEASUREMENT',
                  formula_description: def.formula_description,
                  formula: { expression: def.expression, expression_map, rounding_mechanism: def.rounding_mechanism },
                },
              }),
            })

            let uid = r.json?.data?.formula_uid ?? ''
            if (!uid) {
              uid = existingByName[def.formula_name] ?? existingByKey[def.formula_key] ?? ''
              if (!uid) throw new Error(`Failed to create formula: ${def.formula_name} — ${JSON.stringify(r.json)}`)
            } else {
              created++
            }
            formulaMap[def.formula_key] = uid
          }

          enqueue({ check: 'formulas', status: 'pass', detail: `${FORMULA_DEFINITIONS.length} formulas ready (${created} created)` })
        } catch (e: unknown) {
          enqueue({ check: 'formulas', status: 'fail', detail: (e as Error).message })
          controller.close(); return
        }

        // ── Check 5: UOMs ─────────────────────────────────────────────────────
        enqueue({ check: 'uoms', status: 'running', detail: 'Verifying units of measure…' })
        try {
          const r = await fetchWithRetry(`${baseUrl}misc/uom?filter.industry=roofing`, { headers: zuperHeaders(apiKey) })
          const zuperUoms = new Set((r.json?.data ?? []).map((u: { value: string }) => u.value))
          const missing = Object.values(UOM_MAP).filter(v => !zuperUoms.has(v))
          if (missing.length > 0) throw new Error(`UOMs not supported: ${missing.join(', ')}`)
          enqueue({ check: 'uoms', status: 'pass', detail: `All ${Object.keys(UOM_MAP).length} mapped UOMs confirmed` })
        } catch (e: unknown) {
          enqueue({ check: 'uoms', status: 'fail', detail: (e as Error).message })
          controller.close(); return
        }

        // ── All done ──────────────────────────────────────────────────────────
        enqueue({ check: 'done', categoryMap, warehouseUid, tokenMap, formulaMap })
        controller.close()
      } catch (e: unknown) {
        enqueue({ check: 'done', error: (e as Error).message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
