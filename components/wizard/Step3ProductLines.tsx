'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { shouldSkipByDefault } from '@/lib/product-line-skips'

interface LineItem { line: string; count: number }

export function Step3ProductLines() {
  const { selectedBrands, companyName, setSelectedProductLines, setStep } = useWizardStore()
  const [brandLines, setBrandLines] = useState<Record<string, LineItem[]>>({})
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [search, setSearch] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

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
      const brandSet = new Set(s[brand])
      brandSet.has(line) ? brandSet.delete(line) : brandSet.add(line)
      return { ...s, [brand]: brandSet }
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
    <div className="space-y-8">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Select product lines</h2>
        <p className="text-gray-500 mt-2">
          All product lines are pre-selected. Deselect any you don&apos;t want to import into{' '}
          <span className="font-medium text-orange-500">{companyName}</span>.
        </p>
      </div>

      {selectedBrands.map(brand => {
        const lines = brandLines[brand] ?? []
        const brandSet = selected[brand] ?? new Set()
        const q = search[brand] ?? ''
        const expanded = showAll[brand] ?? false

        // Split into multi-product lines and single-product lines
        const multiLines = lines.filter(l => l.count > 1)
        const singleLines = lines.filter(l => l.count === 1)

        const visibleMulti = q
          ? multiLines.filter(l => l.line.toLowerCase().includes(q.toLowerCase()))
          : multiLines
        const visibleSingle = q
          ? singleLines.filter(l => l.line.toLowerCase().includes(q.toLowerCase()))
          : singleLines

        const selectedCount = lines.filter(l => brandSet.has(l.line)).reduce((s, l) => s + l.count, 0)
        const allOn = lines.every(l => brandSet.has(l.line))

        return (
          <div key={brand} className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
            {/* Brand header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC]">
              <div>
                <span className="font-bold text-gray-900 text-base">{brand}</span>
                <span className="text-sm text-gray-400 ml-2">
                  {selectedCount.toLocaleString()} products · {brandSet.size} of {lines.length} lines
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
                  value={q}
                  onChange={e => setSearch(s => ({ ...s, [brand]: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF9F7] border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-orange-400"
                />
              </div>

              {/* Multi-product lines */}
              {visibleMulti.length > 0 && (
                <div>
                  {!q && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product lines</p>}
                  <div className="flex flex-wrap gap-2">
                    {visibleMulti.map(({ line, count }) => {
                      const on = brandSet.has(line)
                      return (
                        <button
                          key={line}
                          onClick={() => toggle(brand, line)}
                          className={[
                            'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                            on
                              ? 'bg-orange-50 border-orange-400 text-orange-700'
                              : shouldSkipByDefault(brand, line)
                                ? 'bg-gray-50 border-gray-200 text-gray-300 line-through'
                                : 'bg-[#FAF9F7] border-[#E5E2DC] text-gray-400 line-through',
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

              {/* Single-product lines — collapsed by default */}
              {visibleSingle.length > 0 && (
                <div>
                  {!q && (
                    <button
                      onClick={() => setShowAll(s => ({ ...s, [brand]: !expanded }))}
                      className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 hover:text-gray-600"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {expanded ? 'Hide' : 'Show'} single-product accessories ({visibleSingle.length})
                    </button>
                  )}
                  {(expanded || !!q) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {visibleSingle.map(({ line, count }) => {
                        const on = brandSet.has(line)
                        return (
                          <button
                            key={line}
                            onClick={() => toggle(brand, line)}
                            className={[
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all',
                              on
                                ? 'bg-orange-50 border-orange-300 text-orange-600'
                                : 'bg-[#FAF9F7] border-[#E5E2DC] text-gray-400 line-through',
                            ].join(' ')}
                          >
                            {line}
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
