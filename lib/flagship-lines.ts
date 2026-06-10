/**
 * Substitute for SRS's `primary_item` flag on ABC and QXO catalogs.
 *
 * SRS curates a `primary_item` boolean on each row in `srs_products` that
 * marks the flagship product per family (e.g. GAF Timberline HDZ, CertainTeed
 * Landmark PRO, Owens Corning Duration). The proposal engine uses it at line
 * 151 of `app/api/proposal-preview/route.ts` to bubble flagships to the front
 * of their tier's pick list.
 *
 * Neither ABC's materialized view nor QXO's table exposes this flag, but we
 * can derive it at JS time by intersecting the row's `product_line` string
 * with curated patterns per source per brand. ABC prefixes brand names
 * inconsistently (e.g. `CERT Landmark Pro` vs `CertainTeed Landmark AR
 * Solaris`), so the patterns are deliberately permissive — substring,
 * case-insensitive.
 *
 * Use `isFlagship(source, brand, productLine)`. Returns `false` for SRS,
 * since SRS reads the column directly from the DB row.
 */

import type { CatalogSource } from '@/types/wizard'

export const FLAGSHIP_PATTERNS: Record<CatalogSource, Record<string, RegExp[]>> = {
  srs: {},  // SRS uses the primary_item DB column — no JS override
  abc: {
    // GAF: Timberline HD / HDZ / UHDZ / Natural Shadow are the flagship lines.
    // ABC product_line strings: "GAF Timberline HD", "GAF Timberline UHDZ", etc.
    'Gaf': [/timberline\s+(hd|hdz|uhdz|natural\s+shadow)\b/i],
    // CertainTeed: Landmark family is the workhorse. Inconsistent prefixes —
    // "CERT Landmark", "CERT Landmark Pro", "Certainteed Landmark Solaris",
    // "Cert Landmark Pro Solaris" all qualify.
    'Certainteed': [/\blandmark\b/i],
    // Owens Corning: Duration + Oakridge are the entry flagships, TruDefinition
    // is the modern brand umbrella ("OC Trudefinition Duration").
    'Owens Corning': [/\b(duration|oakridge|trudefinition)\b/i],
  },
  qxo: {
    // Spot-checked against live qxo_products.product_line (2026-06-10):
    // strings carry ®/™ marks ("Timberline HDZ™", "Landmark® PRO",
    // "TruDefinition® Duration® Shingles") but the symbols sit on word
    // boundaries, so the ABC patterns match unchanged. "Timberline Ultra HD"
    // (a better-tier line) correctly does NOT match — "ultra" breaks the
    // \s+ between Timberline and HD.
    'Gaf': [/timberline\s+(hd|hdz|uhdz|natural\s+shadow)\b/i],
    'Certainteed': [/\blandmark\b/i],
    'Owens Corning': [/\b(duration|oakridge|trudefinition)\b/i],
  },
}

/**
 * Returns true if this product is a curated flagship for its brand on the
 * given catalog source. Used in place of the SRS `primary_item` column for
 * non-SRS catalogs.
 */
export function isFlagship(
  source: CatalogSource,
  brand: string | null | undefined,
  productLine: string | null | undefined,
): boolean {
  if (source === 'srs') return false
  if (!brand || !productLine) return false
  const patterns = FLAGSHIP_PATTERNS[source]?.[brand] ?? []
  return patterns.some(p => p.test(productLine))
}
