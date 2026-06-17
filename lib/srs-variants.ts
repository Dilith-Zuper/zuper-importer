import { supabase } from './supabase'
import type { SrsVariant } from './product-builder'

/**
 * Paginated variant fetch over a (table, idColumn) pair.
 *
 * PostgREST caps every response at 1000 rows. The product fetch is safe (one row
 * per id), but variant fetches are NOT — a 500-id chunk routinely holds several
 * thousand variants, so an un-paginated query silently drops everything past row
 * 1000 and the affected products end up with empty color/size options. Page each
 * id-chunk with .range(), ordered by the variant PK (unique → deterministic,
 * non-overlapping windows), until drained.
 *
 * Lifted verbatim from app/api/upload/route.ts so the upload and remap flows
 * share one implementation.
 */
export async function fetchVariantRows(
  table: string,
  idColumn: string,
  ids: (number | string)[],
  select: string,
  orderColumn: string,
  restrictedFalse: boolean,
): Promise<Array<Record<string, unknown>>> {
  const PAGE = 1000
  const rows: Array<Record<string, unknown>> = []
  for (let from = 0; from < ids.length; from += 500) {
    const chunk = ids.slice(from, from + 500)
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const base = restrictedFalse
        ? supabase.from(table).select(select).in(idColumn, chunk).eq('is_restricted', false)
        : supabase.from(table).select(select).in(idColumn, chunk)
      const { data, error } = await base.order(orderColumn).range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      const batch = (data ?? []) as unknown as Array<Record<string, unknown>>
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }
  }
  return rows
}

/**
 * Fetch unrestricted SRS variants for the given product ids, materialized into
 * the SrsVariant shape the option-builder expects.
 */
export async function fetchSrsVariants(productIds: (number | string)[]): Promise<SrsVariant[]> {
  if (productIds.length === 0) return []
  const ids = productIds.map(Number)
  const rows = await fetchVariantRows(
    'srs_variants', 'product_id', ids,
    'variant_id, product_id, variant_code, color_name, size_name, variant_image_url, is_restricted',
    'variant_id', true,
  )
  return rows as unknown as SrsVariant[]
}
