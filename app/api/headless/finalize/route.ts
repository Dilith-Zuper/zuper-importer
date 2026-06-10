import { NextRequest, NextResponse } from 'next/server'
import { requireHeadlessKey, selfOrigin, selfFetchJson, consumeSse, type HeadlessState } from '@/lib/headless'
import type { BrandPackage, ProposalLineItem } from '@/types/wizard'

// vendor catalog + proposal templates, sequentially.
export const maxDuration = 300

/**
 * Headless phase 3 — create the vendor catalog and G/B/B proposal templates.
 *
 * POST {
 *   apiKey, state,                       — `state` from /api/headless/import
 *   options?: {
 *     vendor? = true,
 *     proposals? = true,
 *     proposalConfig?: { categoryUid?, statusUid?, layoutUid? }
 *   }
 * }
 *
 * If proposal preflight cannot auto-detect the job category / status / layout
 * and no proposalConfig override is given, responds 422 with the available
 * options so the n8n flow can branch (pick + retry, or notify a human).
 */
export async function POST(req: NextRequest) {
  const denied = requireHeadlessKey(req)
  if (denied) return denied

  try {
    const { apiKey, state, options = {} } = await req.json() as {
      apiKey: string; state: HeadlessState
      options?: { vendor?: boolean; proposals?: boolean; proposalConfig?: { categoryUid?: string; statusUid?: string; layoutUid?: string } }
    }
    const doVendor = options.vendor !== false
    const doProposals = options.proposals !== false

    if (!apiKey?.trim()) return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
    if (!state?.baseUrl) {
      return NextResponse.json({ error: 'state is missing — run plan + import first' }, { status: 400 })
    }
    if ((doVendor || doProposals) && !state.productIdMap) {
      return NextResponse.json({ error: 'state.productIdMap missing — run /api/headless/import first' }, { status: 400 })
    }

    const origin = selfOrigin(req)
    const result: Record<string, unknown> = {}

    // ── Vendor catalog (idempotent — dedupes against an existing vendor) ────
    // A vendor failure shouldn't abort proposals — captured and reported.
    if (doVendor) {
      try {
        const vendor = await consumeSse(origin, '/api/create-vendor', {
          baseUrl: state.baseUrl, apiKey,
          productIdMap: state.productIdMap,
          colorCatalogMap: state.colorCatalogMap ?? {},
          catalogSource: state.catalogSource,
        })
        const v = vendor.final as Record<string, unknown>
        result.vendor = {
          vendorUid: v.vendorUid, catalogEntries: v.catalogEntries,
          skipped: v.skipped, created: v.created, warnings: vendor.warnings,
        }
      } catch (e: unknown) {
        result.vendor = { error: (e as Error).message }
      }
    }

    // ── G/B/B proposal templates ─────────────────────────────────────────────
    if (doProposals) {
      // 1. Preflight: auto-detect job category / status / layout; overrides win.
      const pf = await selfFetchJson<Record<string, unknown>>(origin, '/api/proposal-preflight', {
        baseUrl: state.baseUrl, apiKey,
      })
      const cfg = options.proposalConfig ?? {}
      const categoryUid = cfg.categoryUid ?? (pf.categoryUid as string | null)
      const statusUid   = cfg.statusUid   ?? (pf.statusUid as string | null)
      const layoutUid   = cfg.layoutUid   ?? (pf.layoutUid as string | null)
      if (!categoryUid || !statusUid || !layoutUid) {
        return NextResponse.json({
          needs: 'proposal_config',
          error: 'Proposal preflight could not auto-detect the job category/status/layout — pass options.proposalConfig with the UIDs below',
          categoryOptions: pf.categoryOptions ?? [],
          statusOptions: pf.statusOptions ?? [],
          layoutOptions: pf.layoutOptions ?? [],
          ...(result.vendor ? { vendor: result.vendor } : {}),
        }, { status: 422 })
      }

      // 2. Preview packages per brand.
      const previewRaw = await selfFetchJson<Record<string, unknown>>(origin, '/api/proposal-preview', {
        selectedBrands: state.brands, selectedProductLines: state.productLines,
        selectedTrades: state.trades,
        selectedGutterBrands: state.gutterBrands, selectedGutterProductLines: state.gutterProductLines,
        selectedSidingBrands: state.sidingBrands, selectedSidingProductLines: state.sidingProductLines,
        catalogSource: state.catalogSource, branchNum: state.branchNum,
      })
      const gutterItems = (previewRaw.__gutters as ProposalLineItem[]) ?? []
      const sidingItems = (previewRaw.__siding as ProposalLineItem[]) ?? []
      const skippedBrands = (previewRaw.__skipped as { brand: string; reason: string }[]) ?? []
      delete previewRaw.__gutters; delete previewRaw.__siding; delete previewRaw.__skipped
      const packagesByBrand = previewRaw as unknown as Record<string, BrandPackage>

      // 3. Auto-name templates with the Step10 convention (source-suffixed to
      //    avoid Zuper duplicate-name rejections across catalog sources).
      const tradeLabel = ['roofing', 'gutters', 'siding']
        .filter(t => state.trades.includes(t))
        .map(t => t[0].toUpperCase() + t.slice(1)).join(' + ')
      const sourceLabel = state.catalogSource.toUpperCase()
      const pkgList = Object.keys(packagesByBrand).map(brand => ({
        brand,
        templateName: `${brand} ${tradeLabel} Proposal - ${sourceLabel}`,
        templateDescription: `Good / Better / Best ${tradeLabel.toLowerCase()} package for ${brand} products`,
        pkg: packagesByBrand[brand],
      }))

      if (pkgList.length === 0) {
        result.proposals = { successful: 0, failed: 0, perBrand: [], skippedBrands }
      } else {
        // 4. Create the templates.
        const creation = await consumeSse(origin, '/api/create-proposals', {
          baseUrl: state.baseUrl, apiKey,
          categoryUid, statusUid, layoutTemplateUid: layoutUid,
          formulaMap: state.formulaMap, productIdMap: state.productIdMap,
          serviceIdMap: state.serviceIdMap ?? {},
          selectedTrades: state.trades,
          gutterItems, sidingItems,
          packages: pkgList,
        })
        // create-proposals' terminal event is a bare {type:'complete'} — the
        // per-brand outcomes are the individual {brand, status} events.
        const perBrand = creation.brandResults.map(r => ({
          brand: r.brand, status: r.status, detail: r.step ?? r.message ?? null,
        }))
        result.proposals = {
          successful: perBrand.filter(r => r.status === 'done').length,
          failed: perBrand.filter(r => r.status === 'error').length,
          perBrand,
          skippedBrands,
          warnings: creation.warnings,
        }
      }
    }

    return NextResponse.json({
      ...result,
      summary: {
        company: state.companyName,
        catalogSource: state.catalogSource,
        brands: state.brands,
        productsPlanned: state.productIds?.length ?? 0,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
