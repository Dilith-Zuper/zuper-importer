// Module-level cache — persists for the browser session (page lifetime).
// Stores in-flight promises so concurrent readers await the same request.
//
// Cache keys include catalogSource + branchNum because the same trade returns
// totally different brand/line lists depending on the source and (for QXO)
// the selected branch.

import type { CatalogSource } from '@/types/wizard'

const brandsCache = new Map<string, Promise<unknown>>()
const linesCache  = new Map<string, Promise<unknown>>()

interface SrcArgs {
  catalogSource: CatalogSource
  branchNum?: number | null
}

function brandsCacheKey(trade: string, src: SrcArgs) {
  return `${src.catalogSource}:${src.branchNum ?? '-'}:${trade}`
}
function linesCacheKey(brands: string[], trade: string, src: SrcArgs) {
  return `${src.catalogSource}:${src.branchNum ?? '-'}:${trade}:${[...brands].sort().join(',')}`
}

export function prefetchBrands(trade: string, src: SrcArgs): void {
  // QXO without a branch yields nothing — don't fire until branch is set.
  if (src.catalogSource === 'qxo' && src.branchNum == null) return
  const key = brandsCacheKey(trade, src)
  if (brandsCache.has(key)) return
  brandsCache.set(key,
    fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade, catalogSource: src.catalogSource, branchNum: src.branchNum ?? undefined }),
    }).then(r => r.json())
  )
}

export async function getBrands(trade: string, src: SrcArgs): Promise<unknown> {
  const key = brandsCacheKey(trade, src)
  if (!brandsCache.has(key)) prefetchBrands(trade, src)
  return brandsCache.get(key)!
}

export function prefetchProductLines(brands: string[], trade: string, src: SrcArgs): void {
  if (brands.length === 0) return
  if (src.catalogSource === 'qxo' && src.branchNum == null) return
  const key = linesCacheKey(brands, trade, src)
  if (linesCache.has(key)) return
  linesCache.set(key,
    fetch('/api/product-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedBrands: brands, trade,
        catalogSource: src.catalogSource, branchNum: src.branchNum ?? undefined,
      }),
    }).then(r => r.json())
  )
}

export async function getProductLines(brands: string[], trade: string, src: SrcArgs): Promise<unknown> {
  const key = linesCacheKey(brands, trade, src)
  if (!linesCache.has(key)) prefetchProductLines(brands, trade, src)
  return linesCache.get(key)!
}
