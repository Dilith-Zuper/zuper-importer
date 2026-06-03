'use client'
import { useEffect, useMemo, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import type { CatalogSource, QxoBranch } from '@/types/wizard'

interface SourceDef {
  id: CatalogSource
  label: string
  blurb: string
  productCount: string
  brands: string
}

const SOURCES: SourceDef[] = [
  {
    id: 'srs',
    label: 'SRS Distribution',
    blurb: 'Single national catalog — every brand available everywhere.',
    productCount: '19,807',
    brands: 'GAF · CertainTeed · Owens Corning · IKO · Atlas · Malarkey',
  },
  {
    id: 'qxo',
    label: 'QXO (Beacon)',
    blurb: 'Branch-level catalog — pick a QXO branch and only the products that branch stocks are imported.',
    productCount: '76,812',
    brands: 'GAF · CertainTeed · Owens Corning · TRI-BUILT · Mastic · 2,400+ more',
  },
  {
    id: 'abc',
    label: 'ABC Supply',
    blurb: '316K SKUs across roofing, siding, windows, lumber. Branch-agnostic — all products available.',
    productCount: '34,868',
    brands: 'GAF · CertainTeed · Owens Corning · James Hardie · IKO · 1,500+ more',
  },
]

const SOURCE_ICONS: Record<CatalogSource, React.ReactNode> = {
  srs: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="1.5" /><path d="M3 10h18" /><path d="M9 6V4h6v2" />
    </svg>
  ),
  qxo: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="3" /><path d="M12 21s-7-7-7-12a7 7 0 0114 0c0 5-7 12-7 12z" />
    </svg>
  ),
  abc: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V8l9-5 9 5v13" /><path d="M9 21V12h6v9" />
    </svg>
  ),
}

export function Step2Source() {
  const {
    companyName,
    catalogSource, selectedQxoBranch,
    setCatalogSource, setSelectedQxoBranch,
    setStep,
  } = useWizardStore()

  const [branches, setBranches] = useState<QxoBranch[] | null>(null)
  const [branchErr, setBranchErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Fetch QXO branches once on mount — cheap (~1100 rows), cached server-side.
  useEffect(() => {
    let mounted = true
    fetch('/api/qxo-branches')
      .then(r => r.json())
      .then(d => {
        if (!mounted) return
        if (d.error) setBranchErr(d.error)
        else setBranches(d.branches as QxoBranch[])
      })
      .catch(e => mounted && setBranchErr(e.message))
    return () => { mounted = false }
  }, [])

  // Branch search across name + city + state + region.
  const filteredBranches = useMemo(() => {
    if (!branches) return null
    const q = search.trim().toLowerCase()
    if (!q) return branches
    return branches.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q) ||
      (b.state || '').toLowerCase().includes(q) ||
      (b.regionName || '').toLowerCase().includes(q),
    )
  }, [branches, search])

  // Group filtered branches by region for the list rendering.
  const grouped = useMemo(() => {
    if (!filteredBranches) return null
    const m = new Map<string, QxoBranch[]>()
    for (const b of filteredBranches) {
      const key = b.regionName || '(no region)'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(b)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredBranches])

  const canContinue =
    catalogSource === 'srs' ||
    catalogSource === 'abc' ||
    (catalogSource === 'qxo' && selectedQxoBranch != null)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Which catalog?</h2>
        <p className="text-gray-500 mt-2">
          Pick the data source we'll import into{' '}
          <span className="font-medium text-orange-500">{companyName}</span>.
          QXO is branch-aware — only what the chosen branch stocks gets imported.
        </p>
      </div>

      {/* Source cards */}
      <div className="grid grid-cols-1 gap-4">
        {SOURCES.map(src => {
          const selected = catalogSource === src.id
          return (
            <button
              key={src.id}
              onClick={() => setCatalogSource(src.id)}
              className={[
                'relative text-left rounded-2xl border-2 p-6 transition-all',
                selected ? 'border-orange-400 bg-orange-50' : 'border-[#E5E2DC] bg-white hover:border-gray-300',
              ].join(' ')}
            >
              <div className={[
                'absolute top-5 right-5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300',
              ].join(' ')}>
                {selected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex items-start gap-4 pr-8">
                <span className={`flex-shrink-0 mt-0.5 ${selected ? 'text-orange-500' : 'text-gray-400'}`}>
                  {SOURCE_ICONS[src.id]}
                </span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <p className={`text-lg font-bold ${selected ? 'text-orange-700' : 'text-gray-900'}`}>
                      {src.label}
                    </p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${selected ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                      {src.productCount} products
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{src.blurb}</p>
                  <p className="text-xs text-gray-400 font-medium">{src.brands}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* QXO branch picker — only shown when QXO is selected */}
      {catalogSource === 'qxo' && (
        <div className="rounded-2xl border border-[#E5E2DC] bg-white p-6 space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Choose QXO branch</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Only products this branch carries will be imported. Switch branches anytime
              — your downstream selections will reset.
            </p>
          </div>

          {selectedQxoBranch && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 flex items-start justify-between gap-3">
              <div className="text-sm">
                <p className="font-semibold text-orange-700">{selectedQxoBranch.name}</p>
                <p className="text-xs text-orange-600 mt-0.5">
                  {[selectedQxoBranch.city, selectedQxoBranch.state].filter(Boolean).join(', ')}
                  {selectedQxoBranch.regionName && <> · {selectedQxoBranch.regionName}</>}
                  {selectedQxoBranch.stockedSkuCount != null && (
                    <> · {selectedQxoBranch.stockedSkuCount.toLocaleString()} stocked SKUs</>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedQxoBranch(null)}
                className="text-xs font-medium text-orange-700 hover:text-orange-900 underline"
              >
                Change
              </button>
            </div>
          )}

          {!selectedQxoBranch && (
            <>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by branch name, city, state, or region…"
                className="w-full h-11 px-4 rounded-full border border-[#E5E2DC] bg-white text-sm placeholder-gray-400 focus:outline-none focus:border-orange-400"
              />

              {branchErr && (
                <p className="text-sm text-red-600">Couldn't load branches: {branchErr}</p>
              )}
              {!branches && !branchErr && (
                <p className="text-sm text-gray-400">Loading branches…</p>
              )}

              {grouped && grouped.length === 0 && (
                <p className="text-sm text-gray-500">No branches match "{search}".</p>
              )}

              {grouped && grouped.length > 0 && (
                <div className="max-h-80 overflow-y-auto pr-1 -mr-1 border-t border-[#E5E2DC] pt-3 space-y-3">
                  {grouped.map(([region, items]) => (
                    <div key={region}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 px-2 mb-1">
                        {region}
                      </p>
                      <ul>
                        {items.map(b => (
                          <li key={b.branchNum}>
                            <button
                              onClick={() => setSelectedQxoBranch(b)}
                              className="w-full text-left px-2 py-2 rounded-lg hover:bg-orange-50 transition-colors"
                            >
                              <p className="text-sm font-medium text-gray-900">{b.name}</p>
                              <p className="text-xs text-gray-500">
                                {[b.city, b.state].filter(Boolean).join(', ') || '—'}
                                {' · '}
                                {(b.stockedSkuCount ?? 0).toLocaleString()} stocked SKUs
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setStep(3)}
        disabled={!canContinue}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-full transition-colors text-base"
      >
        Continue →
      </button>

      <button onClick={() => setStep(1)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back to Connect
      </button>
    </div>
  )
}
