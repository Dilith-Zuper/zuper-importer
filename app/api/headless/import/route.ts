import { NextRequest, NextResponse } from 'next/server'
import { requireHeadlessKey, selfOrigin, consumeSse, type HeadlessState } from '@/lib/headless'

// Wraps /api/upload — the slowest phase (hundreds of Zuper POSTs).
export const maxDuration = 300

/**
 * Headless phase 2 — upload products + services into the Zuper account.
 *
 * POST { apiKey, state }   — `state` from /api/headless/plan
 *
 * Returns { uploaded, updated, skipped, errors, warnings, timing, state }
 * with productIdMap/serviceIdMap/colorCatalogMap merged into `state` for
 * /api/headless/finalize. The upload is idempotent — retries are safe.
 */
export async function POST(req: NextRequest) {
  const denied = requireHeadlessKey(req)
  if (denied) return denied

  try {
    const { apiKey, state } = await req.json() as { apiKey: string; state: HeadlessState }
    if (!apiKey?.trim()) return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
    if (!state?.baseUrl || !state?.productIds?.length || !state?.categoryMap) {
      return NextResponse.json({ error: 'state is missing — run /api/headless/plan first (must include baseUrl, productIds, categoryMap)' }, { status: 400 })
    }

    const origin = selfOrigin(req)
    const upload = await consumeSse(origin, '/api/upload', {
      baseUrl: state.baseUrl, apiKey,
      productIds: state.productIds,
      categoryMap: state.categoryMap,
      warehouseUid: state.warehouseUid,
      formulaMap: state.formulaMap,
      productTierFieldUid: state.productTierFieldUid,
      selectedTrades: state.trades,
      serviceCategoryMap: state.serviceCategoryMap ?? {},
      catalogSource: state.catalogSource,
    })

    const d = upload.final as Record<string, unknown>
    const nextState: HeadlessState = {
      ...state,
      productIdMap:    (d.productIdMap as Record<string, string>) ?? {},
      serviceIdMap:    (d.serviceIdMap as Record<string, string>) ?? {},
      colorCatalogMap: (d.colorCatalogMap as Record<string, unknown[]>) ?? {},
    }

    return NextResponse.json({
      uploaded: d.uploaded ?? 0,
      updated:  d.updated ?? 0,
      skipped:  d.skipped ?? 0,
      errors:   d.errors ?? [],
      warnings: upload.warnings,
      timing:   d.timing ?? null,
      state: nextState,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
