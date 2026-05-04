'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { shouldSkipByDefault } from '@/lib/product-line-skips'
import { getSkipCategory, CATEGORY_DEFS } from '@/lib/product-line-categories'

interface LineItem { line: string; count: number }

// ── Badge chip showing WHY a line is excluded ─────────────────────────────────
function CategoryBadge({ categoryKey }: { categoryKey: string }) {
  const def = CATEGORY_DEFS[categoryKey]
  if (!def) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${def.badge}`}>
      {def.label}
    </span>
  )
}

// ── Group specialty lines by category for the summary row ────────────────────
function specialtySummary(brand: string, lines: LineItem[]): string {
  const counts: Record<string, number> = {}
  for (const { line } of lines) {
    const cat = getSkipCategory(brand, line) ?? 'other'
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${CATEGORY_DEFS[cat]?.label ?? cat} (${n})`)
    .join(' · ')
}

// ─────────────────────────────────────────────────────────────────────────────

export function Step3ProductLines() {
  const { selectedBrands, companyName, setSelectedProductLines, setStep } = useWizardStore()
  const [brandLines, setBrandLines] = useState<Record<string, LineItem[]>>({})
  const [selected, setSelected]     = useState<Record<string, Set<string>>>({})
  const [search, setSearch]         = useState<Record<string, string>>({})
  const [showSpecialty, setShowSpecialty] = useState<Record<string, boolean>>({})
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/product-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBrands }),
    }).then(r => r.json()).then(d => {
      setBrandLines(d)
      const init: Record<string, Set<string>> = {}
      for (const [brand, lines] of Object.entries(d as Record<string, LineItem[]>)) {
        init[brand] = new Set(
          lines.filter(l => !shouldSkipByDefault(brand, l.line)).map(l => l.line)
        )
      }
      setSelected(init)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (brand: string, line: string) => {
    setSelected(s => {
      const next = new Set(s[brand])
      next.has(line) ? next.delete(line) : next.add(line)
      return { ...s, [brand]: next }
    })
  }

  const toggleAll = (brand: string, on: boolean) => {
    setSelected(s => ({
      ...s,
      [brand]: on ? new Set(brandLines[brand]?.map(l => l.line) ?? []) : new Set(),
    }))
  }

  const totalSelected = Object.entries(selected).reduce((sum, [brand, set]) => {
    return sum + (brandLines[brand] ?? []).filter(l => set.has(l.line)).reduce((s, l) => s + l.count, 0)
  }, 0)

  function handleContinue() {
    const lines: Record<string, string[]> = {}
    for (const [brand, set] of Object.entries(selected)) {
      lines[brand] = Array.from(set)
    }
    setSelectedProductLines(lines)
    setStep(4)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Select product lines</h2>
        <p className="text-gray-500 mt-2">
          Choosing which product lines to import into{' '}
          <span className="font-medium text-orange-500">{companyName}</span>.
        </p>
      </div>

      {/* ── How pre-selection works ── */}
      <div className="bg-[#FAF9F7] border border-[#E5E2DC] rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-bold text-gray-800">How lines are pre-selected</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Every line was cross-referenced against real Zuper roofing contractor accounts.
            Lines that appear in residential roofing accounts are <strong>pre-selected</strong>.
            Lines that never appear — commercial flat roofing, solar, insulation, interior products,
            and specialty systems — are <strong>excluded by default</strong> and shown in a separate
            section. You can add any excluded line if you need it.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-1 border-t border-[#E5E2DC]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-7 rounded-lg bg-orange-50 border border-orange-400 flex items-center justify-center">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">Pre-selected</p>
              <p className="text-[10px] text-gray-400">Residential roofing line</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-7 rounded-lg bg-white border border-[#E5E2DC]" />
            <div>
              <p className="text-xs font-semibold text-gray-700">Deselected</p>
              <p className="text-[10px] text-gray-400">Toggle off by you</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
              <span className="text-[9px] font-bold text-gray-400">—</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">Excluded</p>
              <p className="text-[10px] text-gray-400">Non-roofing line, click to add</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-brand cards ── */}
      {selectedBrands.map(brand => {
        const lines = brandLines[brand] ?? []
        const brandSet = selected[brand] ?? new Set()
        const q = (search[brand] ?? '').toLowerCase()
        const specialtyOpen = showSpecialty[brand] ?? false

        const roofingLines  = lines.filter(l => !shouldSkipByDefault(brand, l.line))
        const specialtyLines = lines.filter(l => shouldSkipByDefault(brand, l.line))

        const filteredRoofing  = q ? roofingLines.filter(l => l.line.toLowerCase().includes(q))  : roofingLines
        const filteredSpecialty = q ? specialtyLines.filter(l => l.line.toLowerCase().includes(q)) : specialtyLines

        const selectedCount       = lines.filter(l => brandSet.has(l.line)).reduce((s, l) => s + l.count, 0)
        const roofingSelectedCount = roofingLines.filter(l => brandSet.has(l.line)).length
        const specialtySelectedCount = specialtyLines.filter(l => brandSet.has(l.line)).length
        const allOn = lines.every(l => brandSet.has(l.line))

        return (
          <div key={brand} className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">

            {/* Brand header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC]">
              <div>
                <span className="font-bold text-gray-900 text-base">{brand}</span>
                <span className="text-sm text-gray-400 ml-2">
                  {selectedCount.toLocaleString()} products · {brandSet.size}/{lines.length} lines
                </span>
              </div>
              <button
                onClick={() => toggleAll(brand, !allOn)}
                className="text-xs text-orange-500 hover:text-orange-600 font-semibold"
              >
                {allOn ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="p-4 space-y-4">

              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search product lines…"
                  value={search[brand] ?? ''}
                  onChange={e => setSearch(s => ({ ...s, [brand]: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF9F7] border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-orange-400"
                />
              </div>

              {/* ── Roofing Lines ── */}
              {filteredRoofing.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Roofing Lines</p>
                    <span className="text-xs text-gray-400">
                      {roofingSelectedCount}/{roofingLines.length} selected
                    </span>
                    {specialtySelectedCount > 0 && (
                      <span className="text-xs text-orange-500 font-semibold">
                        +{specialtySelectedCount} specialty
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filteredRoofing.map(({ line, count }) => {
                      const on = brandSet.has(line)
                      return (
                        <button
                          key={line}
                          onClick={() => toggle(brand, line)}
                          title={on ? 'Click to deselect' : 'Click to select'}
                          className={[
                            'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                            on
                              ? 'bg-orange-50 border-orange-400 text-orange-700'
                              : 'bg-white border-[#E5E2DC] text-gray-400 hover:border-gray-300',
                          ].join(' ')}
                        >
                          {line}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${on ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Specialty / Non-Roofing ── */}
              {filteredSpecialty.length > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">

                  {/* Collapsible header */}
                  <button
                    onClick={() => setShowSpecialty(s => ({ ...s, [brand]: !specialtyOpen }))}
                    className="w-full flex items-start justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <svg
                          width="12" height="12" viewBox="0 0 12 12" fill="none"
                          className={`text-gray-400 transition-transform flex-shrink-0 mt-0.5 ${specialtyOpen ? 'rotate-90' : ''}`}
                        >
                          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                          Specialty &amp; Non-Roofing
                        </span>
                        <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                          {filteredSpecialty.length} excluded
                        </span>
                      </div>
                      {!specialtyOpen && (
                        <p className="text-[10px] text-gray-400 pl-5 leading-relaxed">
                          {specialtySummary(brand, filteredSpecialty)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2 mt-0.5">
                      {specialtyOpen ? 'hide' : 'show · click any to include'}
                    </span>
                  </button>

                  {/* Expanded list */}
                  {(specialtyOpen || !!q) && (
                    <div className="divide-y divide-gray-50">
                      {filteredSpecialty.map(({ line, count }) => {
                        const on = brandSet.has(line)
                        const catKey = getSkipCategory(brand, line)
                        return (
                          <button
                            key={line}
                            onClick={() => toggle(brand, line)}
                            className={[
                              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                              on ? 'bg-orange-50 hover:bg-orange-100' : 'bg-white hover:bg-gray-50',
                            ].join(' ')}
                          >
                            {/* Checkbox */}
                            <div className={[
                              'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                              on ? 'bg-orange-500 border-orange-500' : 'border-gray-300',
                            ].join(' ')}>
                              {on && (
                                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                  <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>

                            {/* Line name */}
                            <span className={`flex-1 text-sm font-medium truncate ${on ? 'text-orange-700' : 'text-gray-500'}`}>
                              {line}
                            </span>

                            {/* Product count */}
                            <span className="text-xs text-gray-400 flex-shrink-0">{count}</span>

                            {/* Why it's excluded */}
                            {catKey && <CategoryBadge categoryKey={catKey} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )
      })}

      <button
        onClick={handleContinue}
        disabled={totalSelected === 0}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-full transition-colors text-base"
      >
        Continue with {totalSelected.toLocaleString()} products →
      </button>

      <button onClick={() => setStep(2)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back to brand selection
      </button>
    </div>
  )
}
