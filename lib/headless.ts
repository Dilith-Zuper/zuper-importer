/**
 * Shared helpers for the /api/headless/* orchestration layer.
 *
 * These endpoints let an external automation (n8n account-creation flow)
 * drive the full wizard without the UI: they self-fetch the existing API
 * routes (so the battle-tested logic stays single-sourced) and consume the
 * SSE streams server-side, returning plain JSON.
 *
 * Auth: every headless route requires the `x-headless-key` header to match
 * the HEADLESS_API_KEY env var — the app is publicly deployed and these
 * endpoints trigger full imports.
 */
import { NextRequest, NextResponse } from 'next/server'

export function requireHeadlessKey(req: NextRequest): NextResponse | null {
  const expected = process.env.HEADLESS_API_KEY
  if (!expected) {
    return NextResponse.json(
      { error: 'Headless API is not configured (HEADLESS_API_KEY env var missing)' },
      { status: 503 },
    )
  }
  if (req.headers.get('x-headless-key') !== expected) {
    return NextResponse.json({ error: 'Invalid or missing x-headless-key header' }, { status: 401 })
  }
  return null
}

/** Origin of the current deployment, for self-fetching sibling routes. */
export function selfOrigin(req: NextRequest): string {
  return new URL(req.url).origin
}

/** POST to an internal JSON route; throws with the route's error message on failure. */
export async function selfFetchJson<T = Record<string, unknown>>(
  origin: string,
  path: string,
  body: object,
): Promise<T> {
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${(json as { error?: string }).error ?? JSON.stringify(json).slice(0, 200)}`)
  }
  return json as T
}

export interface SseResult {
  /** The terminal event ({type:'done'} / {check:'done'} / {type:'complete'}). */
  final: Record<string, unknown>
  /** All {type:'warning'} messages seen on the stream. */
  warnings: string[]
  /** All error-ish events ({type:'error'}, progress status:'error', check status:'fail'). */
  errors: Record<string, unknown>[]
  /** Per-brand completion events from create-proposals ({brand, status:'done'|'error'}). */
  brandResults: Record<string, unknown>[]
}

/**
 * POST to an internal SSE route and consume the stream to completion.
 * Returns the terminal event plus collected warnings/errors. Throws if the
 * stream ends without a terminal event or the route returns non-200.
 */
export async function consumeSse(origin: string, path: string, body: object): Promise<SseResult> {
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: Record<string, unknown> | null = null
  const warnings: string[] = []
  const errors: Record<string, unknown>[] = []
  const brandResults: Record<string, unknown>[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let evt: Record<string, unknown>
      try { evt = JSON.parse(line.slice(6)) } catch { continue }

      if (evt.type === 'warning' && typeof evt.message === 'string') warnings.push(evt.message)
      if (evt.type === 'error' || evt.status === 'error' || evt.status === 'fail') errors.push(evt)
      // create-proposals emits one {brand, status:'done'|'error'} per template.
      if (evt.brand && (evt.status === 'done' || evt.status === 'error')) brandResults.push(evt)
      // Terminal events: upload/vendor use type:'done', validate uses
      // check:'done', create-proposals uses type:'complete'.
      if (evt.type === 'done' || evt.check === 'done' || evt.type === 'complete') final = evt
    }
  }

  if (!final) {
    throw new Error(
      `${path} stream ended without a done event` +
      (errors.length ? ` — last error: ${JSON.stringify(errors[errors.length - 1]).slice(0, 300)}` : ''),
    )
  }
  return { final, warnings, errors, brandResults }
}

/**
 * The state blob threaded between headless phases. n8n holds this between
 * calls; it is everything the wizard store would have carried. The Zuper
 * apiKey is deliberately NOT part of it — callers supply it per request.
 */
export interface HeadlessState {
  baseUrl: string
  companyName: string
  catalogSource: 'srs' | 'qxo' | 'abc'
  branchNum: number | null
  trades: string[]
  brands: string[]
  productLines: Record<string, string[]>
  gutterBrands: string[]
  gutterProductLines: Record<string, string[]>
  sidingBrands: string[]
  sidingProductLines: Record<string, string[]>
  productIds: (number | string)[]
  counts: { total: number; byCategory: Record<string, number> }
  // From validate:
  categoryMap?: Record<string, string>
  warehouseUid?: string
  formulaMap?: Record<string, string>
  productTierFieldUid?: string
  serviceCategoryMap?: Record<string, string>
  // From import:
  productIdMap?: Record<string, string>
  serviceIdMap?: Record<string, string>
  colorCatalogMap?: Record<string, unknown[]>
}
