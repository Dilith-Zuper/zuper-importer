// Module-level cache — persists for the browser session (page lifetime).
// Stores in-flight promises so concurrent readers await the same request.

const brandsCache = new Map<string, Promise<unknown>>()
const linesCache  = new Map<string, Promise<unknown>>()

function brandsCacheKey(trade: string) { return trade }
function linesCacheKey(brands: string[], trade: string) {
  return `${trade}:${[...brands].sort().join(',')}`
}

export function prefetchBrands(trade: string): void {
  const key = brandsCacheKey(trade)
  if (brandsCache.has(key)) return
  brandsCache.set(key,
    fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade }),
    }).then(r => r.json())
  )
}

export async function getBrands(trade: string): Promise<unknown> {
  const key = brandsCacheKey(trade)
  if (!brandsCache.has(key)) prefetchBrands(trade)
  return brandsCache.get(key)!
}

export function prefetchProductLines(brands: string[], trade: string): void {
  if (brands.length === 0) return
  const key = linesCacheKey(brands, trade)
  if (linesCache.has(key)) return
  linesCache.set(key,
    fetch('/api/product-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBrands: brands, trade }),
    }).then(r => r.json())
  )
}

export async function getProductLines(brands: string[], trade: string): Promise<unknown> {
  const key = linesCacheKey(brands, trade)
  if (!linesCache.has(key)) prefetchProductLines(brands, trade)
  return linesCache.get(key)!
}
