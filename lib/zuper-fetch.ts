// Battle-tested Zuper API utilities — copied verbatim from reference/migrate-jn.js
// Do not modify fetch/retry/fuzzy-match logic.

export const BATCH_SIZE     = 10
export const BATCH_DELAY_MS = 400
export const FETCH_TIMEOUT  = 25_000
export const RETRY_MAX      = 2
export const RETRY_BASE_MS  = 800

export function zuperHeaders(apiKey: string) {
  return { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
}

export function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function stripHtml(str: string) {
  return String(str || '').replace(/<[^>]+>/g, '')
}

export interface FetchResult {
  ok: boolean
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
}

export async function fetchJSON(url: string, opts: RequestInit = {}): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = { raw: text } }
    return { ok: res.ok, status: res.status, json }
  } catch (e: unknown) {
    if ((e as Error).name === 'AbortError') throw new Error(`Request timed out after ${FETCH_TIMEOUT / 1000}s`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchWithRetry(url: string, opts: RequestInit = {}, attempt = 1): Promise<FetchResult> {
  let res: FetchResult
  try {
    res = await fetchJSON(url, opts)
  } catch (e) {
    if (attempt <= RETRY_MAX) {
      await sleep(RETRY_BASE_MS * attempt)
      return fetchWithRetry(url, opts, attempt + 1)
    }
    throw e
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Authentication error (${res.status}) — check API key`)
  }

  if ((res.status === 429 || res.status >= 500) && attempt <= RETRY_MAX) {
    const delay = res.status === 429 ? RETRY_BASE_MS * attempt * 2 : RETRY_BASE_MS * attempt
    await sleep(delay)
    return fetchWithRetry(url, opts, attempt + 1)
  }

  return res
}

// ── Fuzzy token matching ──────────────────────────────────────────────────────

export function normalizeToken(name: string) {
  return name
    .toLowerCase()
    .replace(/″|ʺ|"{2}|''/g, ' inch ')
    .replace(/′|ʹ/g, ' foot ')
    .replace(/"/g, ' inch ')
    .replace(/'/g, ' foot ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordOverlapScore(a: string, b: string) {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean))
  const wordsB = new Set(b.split(/\s+/).filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const intersection = Array.from(wordsA).filter(w => wordsB.has(w)).length
  return (2 * intersection) / (wordsA.size + wordsB.size)
}

export interface ZuperToken {
  measurement_token_uid: string
  measurement_token_name: string
  uom?: string
  categoryUid: string
}

export interface BestMatch {
  uid: string
  name: string
  categoryUid: string
  score: number
}

export function bestZuperMatch(tokenName: string, defaultTokens: ZuperToken[]): BestMatch | null {
  const normName = normalizeToken(tokenName)
  let best: BestMatch | null = null
  let bestScore = 0
  for (const t of defaultTokens) {
    const score = wordOverlapScore(normName, normalizeToken(t.measurement_token_name))
    if (score > bestScore) {
      bestScore = score
      best = { uid: t.measurement_token_uid, name: t.measurement_token_name, categoryUid: t.categoryUid, score }
    }
  }
  return bestScore >= 0.5 ? best : null
}
