import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Force runtime evaluation — at build time, prerendering would walk 512K rows
// in qxo_branch_sku just to count them, which times out the Next static
// generator. Cache headers on the response handle reuse between user hits.
export const dynamic = 'force-dynamic'
export const revalidate = 300

const PAGE = 1000

/**
 * Returns every QXO branch with a stocked-SKU count, grouped by region.
 *
 *   Two passes:
 *     1. SELECT * FROM qxo_branches  (paginate past the 1000-row cap)
 *     2. SELECT branch_num, count(*) GROUP BY → not supported in PostgREST;
 *        instead we fetch all qxo_branch_sku rows (already filtered to
 *        avail=1 at ingest) and count client-side.
 *
 *   The avail-only matrix is ~512K rows. We page through and accumulate
 *   counts. Takes 2–3 seconds. Result is cached client-side via the cache
 *   headers below since branches change only on re-ingest.
 */
export async function GET() {
  try {
    // ── 1. Branches ────────────────────────────────────────────────────────
    const branches: Array<{
      branch_num: number; name: string; city: string | null; state: string | null; region_name: string | null
    }> = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('qxo_branches')
        .select('branch_num, name, city, state, region_name')
        .order('branch_num')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      branches.push(...(data ?? []))
      if ((data ?? []).length < PAGE) break
      from += PAGE
    }

    // ── 2. Stocked count per branch ────────────────────────────────────────
    const stockedByBranch = new Map<number, number>()
    let bsFrom = 0
    while (true) {
      const { data, error } = await supabase
        .from('qxo_branch_sku')
        .select('branch_num')
        .order('branch_num')
        .range(bsFrom, bsFrom + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) {
        const n = (r as { branch_num: number }).branch_num
        stockedByBranch.set(n, (stockedByBranch.get(n) ?? 0) + 1)
      }
      if ((data ?? []).length < PAGE) break
      bsFrom += PAGE
    }

    // ── 3. Shape response ──────────────────────────────────────────────────
    const result = branches
      .map(b => ({
        branchNum:        b.branch_num,
        name:             b.name,
        city:             b.city,
        state:            b.state,
        regionName:       b.region_name,
        stockedSkuCount:  stockedByBranch.get(b.branch_num) ?? 0,
      }))
      // Only show branches with any inventory — empty branches confuse CSMs
      .filter(b => b.stockedSkuCount > 0)
      .sort((a, b) =>
        (a.regionName || '').localeCompare(b.regionName || '') ||
        (a.name       || '').localeCompare(b.name       || ''),
      )

    return NextResponse.json(
      { branches: result },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    )
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
