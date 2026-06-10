import { NextRequest, NextResponse } from 'next/server'
import { requireHeadlessKey, selfOrigin, selfFetchJson } from '@/lib/headless'

/**
 * Headless discovery: list brands (and optionally product lines) for a
 * catalog source, so an n8n flow can build allow-lists without the UI.
 *
 * POST { catalogSource, branchNum?, trade? = 'roofing',
 *        brands?: string[]  — limit the productLines lookup to these brands
 *        includeLines? = false — fetch product lines (for `brands` if given,
 *                                else for every brand returned) }
 */
export async function POST(req: NextRequest) {
  const denied = requireHeadlessKey(req)
  if (denied) return denied

  try {
    const {
      catalogSource = 'srs', branchNum = null, trade = 'roofing',
      brands = null, includeLines = false,
    } = await req.json() as {
      catalogSource?: 'srs' | 'qxo' | 'abc'; branchNum?: number | null
      trade?: string; brands?: string[] | null; includeLines?: boolean
    }

    if (catalogSource === 'qxo' && branchNum == null) {
      return NextResponse.json({ error: 'QXO requires branchNum (GET /api/qxo-branches to list)' }, { status: 400 })
    }

    const origin = selfOrigin(req)
    const brandRes = await selfFetchJson<Record<string, { name: string; count: number }[]>>(
      origin, '/api/brands', { catalogSource, trade, branchNum },
    )

    let productLines: Record<string, { line: string; count: number }[]> | undefined
    if (includeLines || brands?.length) {
      const targetBrands = brands?.length
        ? brands
        : [...(brandRes.big3 ?? []), ...(brandRes.topSecondary ?? []), ...(brandRes.otherBrands ?? []), ...(brandRes.brands ?? [])].map(b => b.name)
      productLines = await selfFetchJson(origin, '/api/product-lines', {
        selectedBrands: targetBrands, catalogSource, trade, branchNum,
      })
    }

    return NextResponse.json({ ...brandRes, ...(productLines ? { productLines } : {}) })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
