import { NextRequest, NextResponse } from 'next/server'
import { requireHeadlessKey, selfOrigin, selfFetchJson, consumeSse, type HeadlessState } from '@/lib/headless'

// connect + brands + preview + validate (validate alone can take ~2 min on a
// fresh account: it creates categories, tokens, formulas, the tier field).
export const maxDuration = 300

/**
 * Headless phase 1 — resolve the selection and validate the Zuper account.
 *
 * POST {
 *   companyLoginName, apiKey,
 *   catalogSource? = 'srs', branchNum?,            — branchNum required for qxo
 *   trades? = ['roofing'],
 *   brands? = 'big3' | string[],                   — preset or explicit list
 *   extraBrands? = [],                             — merged into the preset
 *   productLines? = 'all' | Record<brand, string[]>,
 *   gutterBrands? = [], gutterProductLines? = {},
 *   sidingBrands? = [], sidingProductLines? = {},
 *   dryRun? = false                                — stop after preview (no Zuper writes)
 * }
 *
 * Returns { state, checks?, warnings? } — pass `state` to /api/headless/import.
 */
export async function POST(req: NextRequest) {
  const denied = requireHeadlessKey(req)
  if (denied) return denied

  try {
    const {
      companyLoginName, apiKey,
      catalogSource = 'srs', branchNum = null,
      trades = ['roofing'],
      brands = 'big3', extraBrands = [],
      productLines = 'all',
      gutterBrands = [], gutterProductLines = {},
      sidingBrands = [], sidingProductLines = {},
      dryRun = false,
    } = await req.json()

    if (!companyLoginName?.trim() || !apiKey?.trim()) {
      return NextResponse.json({ error: 'companyLoginName and apiKey are required' }, { status: 400 })
    }
    if (catalogSource === 'qxo' && branchNum == null) {
      return NextResponse.json({ error: 'QXO requires branchNum (GET /api/qxo-branches to list)' }, { status: 400 })
    }

    const origin = selfOrigin(req)

    // 1. Connect — resolve baseUrl + verify the API key.
    const { baseUrl, companyName } = await selfFetchJson<{ baseUrl: string; companyName: string }>(
      origin, '/api/connect', { companyLoginName, apiKey },
    )

    // 2. Resolve brands: 'big3' preset → canonical Big 3 from the brands route.
    let resolvedBrands: string[]
    if (Array.isArray(brands)) {
      resolvedBrands = brands
    } else if (brands === 'big3') {
      const b = await selfFetchJson<{ big3?: { name: string }[] }>(
        origin, '/api/brands', { catalogSource, trade: 'roofing', branchNum },
      )
      resolvedBrands = (b.big3 ?? []).map(x => x.name)
    } else {
      return NextResponse.json({ error: `Unknown brands preset "${brands}" — use 'big3' or an array of brand names` }, { status: 400 })
    }
    for (const extra of extraBrands as string[]) {
      if (!resolvedBrands.includes(extra)) resolvedBrands.push(extra)
    }
    if (resolvedBrands.length === 0) {
      return NextResponse.json({ error: 'No brands resolved — the catalog returned no Big 3 brands and no extraBrands were given' }, { status: 422 })
    }

    // 3. Resolve product lines: 'all' = no filtering (routes treat missing keys as all lines).
    const resolvedLines: Record<string, string[]> = productLines === 'all' ? {} : productLines

    // 4. Preview — resolves the concrete product id set.
    const preview = await selfFetchJson<{ productIds: (number | string)[]; counts: { total: number; byCategory: Record<string, number> } }>(
      origin, '/api/preview', {
        selectedBrands: resolvedBrands, selectedProductLines: resolvedLines,
        selectedTrades: trades,
        selectedGutterBrands: gutterBrands, selectedGutterProductLines: gutterProductLines,
        selectedSidingBrands: sidingBrands, selectedSidingProductLines: sidingProductLines,
        catalogSource, branchNum,
      },
    )

    const state: HeadlessState = {
      baseUrl, companyName, catalogSource, branchNum, trades,
      brands: resolvedBrands, productLines: resolvedLines,
      gutterBrands, gutterProductLines, sidingBrands, sidingProductLines,
      productIds: preview.productIds, counts: preview.counts,
    }

    if (dryRun) {
      return NextResponse.json({ dryRun: true, state })
    }

    // 5. Validate — auto-creates categories/warehouse/tokens/formulas/tier field
    //    (idempotent) and returns the maps the upload phase needs.
    const validation = await consumeSse(origin, '/api/validate', {
      baseUrl, apiKey, productIds: preview.productIds, selectedTrades: trades, catalogSource,
    })
    const v = validation.final as Record<string, unknown>
    if (v.error) {
      return NextResponse.json({ error: `validation failed: ${v.error}`, checks: validation.errors }, { status: 502 })
    }
    state.categoryMap         = v.categoryMap as Record<string, string>
    state.warehouseUid        = v.warehouseUid as string
    state.formulaMap          = v.formulaMap as Record<string, string>
    state.productTierFieldUid = v.productTierFieldUid as string
    state.serviceCategoryMap  = (v.serviceCategoryMap as Record<string, string>) ?? {}

    return NextResponse.json({
      state,
      failedChecks: validation.errors,
      warnings: validation.warnings,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
