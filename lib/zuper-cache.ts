/**
 * In-memory TTL cache for read-mostly Zuper API listings (categories, formulas,
 * measurement tokens, etc.) that get re-fetched across wizard routes for the
 * same account.
 *
 * Scope: server-side singleton, keyed by apiKey. TTL 5 minutes — long enough to
 * cover an end-to-end wizard run (validate → preview → upload → proposals),
 * short enough to pick up account-side edits made via the Zuper UI.
 *
 * Writes that mutate the underlying resource (create category, create formula)
 * should call `invalidate(apiKey, resource)` so the next read re-fetches.
 */

type Resource = 'categories' | 'formulas' | 'measurement_categories' | 'locations' | 'uoms' | 'custom_fields'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const TTL_MS = 5 * 60 * 1000

// Module-level singleton: Map<apiKey, Map<resource, CacheEntry>>
const store = new Map<string, Map<Resource, CacheEntry<unknown>>>()

function bucket(apiKey: string) {
  let m = store.get(apiKey)
  if (!m) {
    m = new Map()
    store.set(apiKey, m)
  }
  return m
}

export async function getCached<T>(
  apiKey: string,
  resource: Resource,
  fetcher: () => Promise<T>,
): Promise<T> {
  const m = bucket(apiKey)
  const hit = m.get(resource) as CacheEntry<T> | undefined
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value
  const value = await fetcher()
  m.set(resource, { value, expiresAt: now + TTL_MS })
  return value
}

export function invalidate(apiKey: string, resource: Resource) {
  bucket(apiKey).delete(resource)
}

export function invalidateAll(apiKey: string) {
  store.delete(apiKey)
}
