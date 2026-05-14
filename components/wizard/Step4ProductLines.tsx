'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { getProductLines } from '@/lib/brands-cache'
import { shouldSkipByDefault } from '@/lib/product-line-skips'
import { getSkipCategory, CATEGORY_DEFS } from '@/lib/product-line-categories'
import type { Trade } from '@/types/wizard'

interface LineItem { line: string; count: number }
const TRADE_LABELS: Record<Trade, string> = { roofing: 'Roofing', gutters: 'Gutters', siding: 'Siding' }

// ── Simple trade tab (gutters / siding) ──────────────────────────────────────
function SimpleLineTab({ brand, lines, selected, onToggle }: {
  brand: string
  lines: LineItem[]
  selected: Set<string>
  onToggle: (line: string) => void
}) {
  const [q, setQ] = useState('')
  const filtered = q ? lines.filter(l => l.line.toLowerCase().includes(q.toLowerCase())) : lines
  const selectedCount = lines.filter(l => selected.has(l.line)).reduce((s, l) => s + l.count, 0)

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC]">
        <div>
          <span className="font-bold text-gray-900">{brand}</span>
          <span className="text-sm text-gray-400 ml-2">{selectedCount.toLocaleString()} products · {selected.size}/{lines.length} lines</span>
        </div>
        <button onClick={() => {
          const allOn = lines.every(l => selected.has(l.line))
          lines.forEach(l => { if (allOn) selected.delete(l.line); else selected.add(l.line) })
          onToggle('__all__')
        }} className="text-xs text-orange-500 hover:text-orange-600 font-semibold">
          {lines.every(l => selected.has(l.line)) ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input type="text" placeholder="Search product lines…" value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF9F7] border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-orange-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {filtered.map(({ line, count }) => {
            const on = selected.has(line)
            return (
              <button key={line} onClick={() => onToggle(line)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${on ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-white border-[#E5E2DC] text-gray-400 hover:border-gray-300'}`}>
                {line}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${on ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Roofing card (existing logic) ────────────────────────────────────────────
function CategoryBadge({ categoryKey }: { categoryKey: string }) {
  const def = CATEGORY_DEFS[categoryKey]
  if (!def) return null
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${def.badge}`}>{def.label}</span>
}

function specialtySummary(brand: string, lines: LineItem[]) {
  const counts: Record<string, number> = {}
  for (const { line } of lines) { const cat = getSkipCategory(brand, line) ?? 'other'; counts[cat] = (counts[cat] ?? 0) + 1 }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cat, n]) => `${CATEGORY_DEFS[cat]?.label ?? cat} (${n})`).join(' · ')
}

function RoofingLineCard({ brand, lines, selected, onToggle, onToggleAll }: {
  brand: string; lines: LineItem[]; selected: Set<string>; onToggle: (line: string) => void; onToggleAll: (on: boolean) => void
}) {
  const [q, setQ] = useState('')
  const [showSpecialty, setShowSpecialty] = useState(false)
  const lower = q.toLowerCase()
  const roofingLines  = lines.filter(l => !shouldSkipByDefault(brand, l.line))
  const specialtyLines = lines.filter(l => shouldSkipByDefault(brand, l.line))
  const filteredRoofing  = q ? roofingLines.filter(l => l.line.toLowerCase().includes(lower)) : roofingLines
  const filteredSpecialty = q ? specialtyLines.filter(l => l.line.toLowerCase().includes(lower)) : specialtyLines
  const selectedCount = lines.filter(l => selected.has(l.line)).reduce((s, l) => s + l.count, 0)
  const roofingSelectedCount = roofingLines.filter(l => selected.has(l.line)).length
  const allOn = lines.every(l => selected.has(l.line))

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC]">
        <div>
          <span className="font-bold text-gray-900">{brand}</span>
          <span className="text-sm text-gray-400 ml-2">{selectedCount.toLocaleString()} products · {selected.size}/{lines.length} lines</span>
        </div>
        <button onClick={() => onToggleAll(!allOn)} className="text-xs text-orange-500 hover:text-orange-600 font-semibold">{allOn ? 'Deselect all' : 'Select all'}</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>
          <input type="text" placeholder="Search product lines…" value={q} onChange={e => setQ(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF9F7] border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-orange-400" />
        </div>
        {filteredRoofing.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Roofing Lines</p>
              <span className="text-xs text-gray-400">{roofingSelectedCount}/{roofingLines.length} selected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredRoofing.map(({ line, count }) => {
                const on = selected.has(line)
                return (
                  <button key={line} onClick={() => onToggle(line)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${on ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-white border-[#E5E2DC] text-gray-400 hover:border-gray-300'}`}>
                    {line}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${on ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {filteredSpecialty.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setShowSpecialty(s => !s)} className="w-full flex items-start justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-gray-400 transition-transform ${showSpecialty ? 'rotate-90' : ''}`}><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Specialty &amp; Non-Roofing</span>
                  <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-semibold">{filteredSpecialty.length} excluded</span>
                </div>
                {!showSpecialty && <p className="text-[10px] text-gray-400 pl-5">{specialtySummary(brand, filteredSpecialty)}</p>}
              </div>
              <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2 mt-0.5">{showSpecialty ? 'hide' : 'show · click to include'}</span>
            </button>
            {(showSpecialty || !!q) && (
              <div className="divide-y divide-gray-50">
                {filteredSpecialty.map(({ line, count }) => {
                  const on = selected.has(line)
                  const catKey = getSkipCategory(brand, line)
                  return (
                    <button key={line} onClick={() => onToggle(line)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${on ? 'bg-orange-50 hover:bg-orange-100' : 'bg-white hover:bg-gray-50'}`}>
                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${on ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}>
                        {on && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className={`flex-1 text-sm font-medium truncate ${on ? 'text-orange-700' : 'text-gray-500'}`}>{line}</span>
                      <span className="text-xs text-gray-400">{count}</span>
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
}

// ── Main component ───────────────────────────────────────────────────────────
export function Step4ProductLines() {
  const {
    selectedTrades,
    selectedBrands, selectedGutterBrands, selectedSidingBrands,
    companyName,
    setSelectedProductLines, setSelectedGutterProductLines, setSelectedSidingProductLines,
    setStep,
  } = useWizardStore()

  const [activeTab, setActiveTab] = useState<Trade>(selectedTrades[0] ?? 'roofing')
  const [brandLines, setBrandLines]       = useState<Record<string, LineItem[]>>({})
  const [gutterLines, setGutterLines]     = useState<Record<string, LineItem[]>>({})
  const [sidingLines, setSidingLines]     = useState<Record<string, LineItem[]>>({})
  const [roofSelected, setRoofSelected]   = useState<Record<string, Set<string>>>({})
  const [gutterSel, setGutterSel]         = useState<Record<string, Set<string>>>({})
  const [sidingSel, setSidingSel]         = useState<Record<string, Set<string>>>({})
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [retryNonce, setRetryNonce]       = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const applyLines = (d: Record<string, LineItem[]>, setter: (d: Record<string, LineItem[]>) => void, selSetter: (d: Record<string, Set<string>>) => void, preSelectAll = false) => {
      setter(d)
      const init: Record<string, Set<string>> = {}
      for (const [brand, lines] of Object.entries(d)) {
        init[brand] = preSelectAll
          ? new Set(lines.map(l => l.line))
          : new Set(lines.filter(l => !shouldSkipByDefault(brand, l.line)).map(l => l.line))
      }
      selSetter(init)
    }

    const fetches: Promise<void>[] = []
    if (selectedTrades.includes('roofing') && selectedBrands.length) {
      fetches.push(getProductLines(selectedBrands, 'roofing').then((d: any) => applyLines(d, setBrandLines, setRoofSelected, false)))
    }
    if (selectedTrades.includes('gutters') && selectedGutterBrands.length) {
      fetches.push(getProductLines(selectedGutterBrands, 'gutters').then((d: any) => applyLines(d, setGutterLines, setGutterSel, true)))
    }
    if (selectedTrades.includes('siding') && selectedSidingBrands.length) {
      fetches.push(getProductLines(selectedSidingBrands, 'siding').then((d: any) => applyLines(d, setSidingLines, setSidingSel, true)))
    }
    Promise.all(fetches)
      .then(() => setLoading(false))
      .catch((e: unknown) => {
        setError((e as Error).message || 'Failed to load product lines.')
        setLoading(false)
      })
  }, [retryNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRoofLine = (brand: string, line: string) => {
    if (line === '__all__') return // handled inline in SimpleLineTab
    setRoofSelected(s => { const b = new Set(s[brand]); b.has(line) ? b.delete(line) : b.add(line); return { ...s, [brand]: b } })
  }
  const toggleGutterLine = (brand: string, line: string) => {
    if (line === '__all__') {
      setGutterSel(s => { const lines = gutterLines[brand] ?? []; const allOn = lines.every(l => s[brand]?.has(l.line)); const n = allOn ? new Set<string>() : new Set(lines.map(l => l.line)); return { ...s, [brand]: n } })
    } else {
      setGutterSel(s => { const b = new Set(s[brand]); b.has(line) ? b.delete(line) : b.add(line); return { ...s, [brand]: b } })
    }
  }
  const toggleSidingLine = (brand: string, line: string) => {
    if (line === '__all__') {
      setSidingSel(s => { const lines = sidingLines[brand] ?? []; const allOn = lines.every(l => s[brand]?.has(l.line)); const n = allOn ? new Set<string>() : new Set(lines.map(l => l.line)); return { ...s, [brand]: n } })
    } else {
      setSidingSel(s => { const b = new Set(s[brand]); b.has(line) ? b.delete(line) : b.add(line); return { ...s, [brand]: b } })
    }
  }

  const totalSelected = [
    ...Object.entries(roofSelected).flatMap(([b, set]) => (brandLines[b] ?? []).filter(l => set.has(l.line)).map(l => l.count)),
    ...Object.entries(gutterSel).flatMap(([b, set]) => (gutterLines[b] ?? []).filter(l => set.has(l.line)).map(l => l.count)),
    ...Object.entries(sidingSel).flatMap(([b, set]) => (sidingLines[b] ?? []).filter(l => set.has(l.line)).map(l => l.count)),
  ].reduce((a, b) => a + b, 0)

  function handleContinue() {
    const toRecord = (sel: Record<string, Set<string>>) => Object.fromEntries(Object.entries(sel).map(([b, s]) => [b, Array.from(s)]))
    if (selectedTrades.includes('roofing')) setSelectedProductLines(toRecord(roofSelected))
    if (selectedTrades.includes('gutters')) setSelectedGutterProductLines(toRecord(gutterSel))
    if (selectedTrades.includes('siding'))  setSelectedSidingProductLines(toRecord(sidingSel))
    setStep(5)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" /></div>

  if (error) return (
    <div className="space-y-4 py-12 text-center">
      <p className="text-base font-semibold text-[#1A1A1A]">Couldn&apos;t load product lines</p>
      <p className="text-sm text-gray-500 max-w-md mx-auto">{error}</p>
      <button onClick={() => setRetryNonce(n => n + 1)}
        className="h-10 px-5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-full transition-colors">
        Try again
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Select product lines</h2>
        <p className="text-gray-500 mt-2">Choosing which lines to import into <span className="font-medium text-orange-500">{companyName}</span></p>
      </div>

      {selectedTrades.length > 1 && (
        <div className="flex gap-1 bg-[#F5F3F0] rounded-xl p-1">
          {selectedTrades.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === t ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {TRADE_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      {/* Roofing */}
      {(activeTab === 'roofing' || selectedTrades.length === 1 && selectedTrades[0] === 'roofing') && selectedTrades.includes('roofing') && (
        <div className="space-y-4">
          {selectedBrands.map(brand => (
            <RoofingLineCard key={brand} brand={brand} lines={brandLines[brand] ?? []}
              selected={roofSelected[brand] ?? new Set()}
              onToggle={(line) => toggleRoofLine(brand, line)}
              onToggleAll={(on) => setRoofSelected(s => ({ ...s, [brand]: on ? new Set(brandLines[brand]?.map(l => l.line)) : new Set() }))}
            />
          ))}
        </div>
      )}

      {/* Gutters */}
      {(activeTab === 'gutters' || selectedTrades.length === 1 && selectedTrades[0] === 'gutters') && selectedTrades.includes('gutters') && (
        <div className="space-y-4">
          {selectedGutterBrands.map(brand => (
            <SimpleLineTab key={brand} brand={brand} lines={gutterLines[brand] ?? []}
              selected={gutterSel[brand] ?? new Set()} onToggle={(line) => toggleGutterLine(brand, line)} />
          ))}
        </div>
      )}

      {/* Siding */}
      {(activeTab === 'siding' || selectedTrades.length === 1 && selectedTrades[0] === 'siding') && selectedTrades.includes('siding') && (
        <div className="space-y-4">
          {selectedSidingBrands.map(brand => (
            <SimpleLineTab key={brand} brand={brand} lines={sidingLines[brand] ?? []}
              selected={sidingSel[brand] ?? new Set()} onToggle={(line) => toggleSidingLine(brand, line)} />
          ))}
        </div>
      )}

      <button onClick={handleContinue} disabled={totalSelected === 0}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-full transition-colors text-base">
        Continue with {totalSelected.toLocaleString()} products →
      </button>
      <button onClick={() => setStep(3)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back to brand selection
      </button>
    </div>
  )
}
