'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { getBrands, prefetchProductLines } from '@/lib/brands-cache'
import { BrandTile } from '@/components/ui/BrandTile'
import type { Trade } from '@/types/wizard'

interface BrandItem { name: string; count: number; isBig3?: boolean }

const TRADE_LABELS: Record<Trade, string> = { roofing: 'Roofing', gutters: 'Gutters', siding: 'Siding' }

function brandMatches(query: string, name: string): boolean {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  if (n.includes(q)) return true
  // Fuzzy: tolerate up to ceil(queryLen/4) edits against the brand name prefix
  const threshold = Math.ceil(q.length / 4)
  const prefix = n.substring(0, q.length + threshold)
  const m = q.length, k = prefix.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: k + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= k; j++)
      dp[i][j] = q[i - 1] === prefix[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][k] <= threshold
}

// ── Simple brand list for gutters / siding ──────────────────────────────────
function SimpleBrandList({
  brands, selected, onToggle,
}: { brands: BrandItem[]; selected: Set<string>; onToggle: (name: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = brands.filter(b => brandMatches(search, b.name))

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search brands…"
          className="w-full bg-white border border-[#E5E2DC] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 transition-all" />
      </div>
      <div className="max-h-64 overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl divide-y divide-[#F5F3F0]">
        {filtered.map(b => (
          <label key={b.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 cursor-pointer transition-colors">
            <input type="checkbox" checked={selected.has(b.name)} onChange={() => onToggle(b.name)}
              className="accent-orange-500 w-4 h-4 rounded" />
            <span className="text-sm text-gray-700 flex-1">{b.name}</span>
            <span className="text-xs text-gray-400">{b.count.toLocaleString()}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No brands found</p>}
      </div>
      {selected.size > 0 && (
        <p className="text-xs text-orange-500 font-medium">{selected.size} brand{selected.size !== 1 ? 's' : ''} selected</p>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export function Step3Brands() {
  const {
    companyName, selectedTrades,
    setSelectedBrands, setSelectedGutterBrands, setSelectedSidingBrands,
    setStep,
  } = useWizardStore()

  const [activeTab, setActiveTab] = useState<Trade>(selectedTrades[0] ?? 'roofing')

  // Roofing state
  const [big3, setBig3] = useState<BrandItem[]>([])
  const [topSecondary, setTopSecondary] = useState<BrandItem[]>([])
  const [otherBrands, setOtherBrands] = useState<BrandItem[]>([])
  const [roofingSelected, setRoofingSelected] = useState<Set<string>>(new Set())
  const [roofSearch, setRoofSearch] = useState('')

  // Gutter / siding state
  const [gutterBrands, setGutterBrands] = useState<BrandItem[]>([])
  const [sidingBrands, setSidingBrands] = useState<BrandItem[]>([])
  const [gutterSelected, setGutterSelected] = useState<Set<string>>(new Set())
  const [sidingSelected, setSidingSelected] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)

  // Load brands from cache (populated by Step2 prefetch, or fetch fresh)
  useEffect(() => {
    const fetches: Promise<void>[] = []

    if (selectedTrades.includes('roofing')) {
      fetches.push(
        getBrands('roofing').then((d: any) => {
          const b3: BrandItem[] = d.big3 ?? []
          setBig3(b3); setTopSecondary(d.topSecondary ?? []); setOtherBrands(d.otherBrands ?? [])
          setRoofingSelected(new Set(b3.map((b: BrandItem) => b.name)))
        })
      )
    }
    if (selectedTrades.includes('gutters')) {
      fetches.push(getBrands('gutters').then((d: any) => setGutterBrands(d.brands ?? [])))
    }
    if (selectedTrades.includes('siding')) {
      fetches.push(getBrands('siding').then((d: any) => setSidingBrands(d.brands ?? [])))
    }

    Promise.all(fetches).then(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce-prefetch product lines as user selects brands (before they click Continue)
  useEffect(() => {
    if (roofingSelected.size === 0) return
    const timer = setTimeout(() => {
      prefetchProductLines(Array.from(roofingSelected), 'roofing')
    }, 400)
    return () => clearTimeout(timer)
  }, [roofingSelected])

  useEffect(() => {
    if (gutterSelected.size === 0) return
    const timer = setTimeout(() => {
      prefetchProductLines(Array.from(gutterSelected), 'gutters')
    }, 400)
    return () => clearTimeout(timer)
  }, [gutterSelected])

  useEffect(() => {
    if (sidingSelected.size === 0) return
    const timer = setTimeout(() => {
      prefetchProductLines(Array.from(sidingSelected), 'siding')
    }, 400)
    return () => clearTimeout(timer)
  }, [sidingSelected])

  const toggleRoofing = (name: string) => setRoofingSelected(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  const toggleGutter  = (name: string) => setGutterSelected(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  const toggleSiding  = (name: string) => setSidingSelected(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })

  const canContinue =
    (!selectedTrades.includes('roofing') || roofingSelected.size > 0) &&
    (!selectedTrades.includes('gutters') || gutterSelected.size > 0) &&
    (!selectedTrades.includes('siding')  || sidingSelected.size > 0)

  function handleContinue() {
    if (selectedTrades.includes('roofing')) setSelectedBrands(Array.from(roofingSelected))
    if (selectedTrades.includes('gutters')) setSelectedGutterBrands(Array.from(gutterSelected))
    if (selectedTrades.includes('siding'))  setSelectedSidingBrands(Array.from(sidingSelected))
    setStep(4)
  }

  const filteredOthers = roofSearch
    ? [...big3, ...topSecondary, ...otherBrands].filter(b => brandMatches(roofSearch, b.name))
    : otherBrands

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Which brands do you carry?</h2>
        <p className="text-gray-500 mt-2">Select brands for each trade you&apos;re importing into <span className="font-medium text-orange-500">{companyName}</span></p>
      </div>

      {/* Trade tabs — only shown when multiple trades selected */}
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

      {/* Roofing tab */}
      {(activeTab === 'roofing' || selectedTrades.length === 1 && selectedTrades[0] === 'roofing') && selectedTrades.includes('roofing') && (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Always Included</p>
            <div className="grid grid-cols-3 gap-3">
              {big3.map(b => <BrandTile key={b.name} name={b.name} count={b.count} selected={roofingSelected.has(b.name)} onClick={() => toggleRoofing(b.name)} />)}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Popular Secondary Brands</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {topSecondary.map(b => <BrandTile key={b.name} name={b.name} count={b.count} selected={roofingSelected.has(b.name)} onClick={() => toggleRoofing(b.name)} />)}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Other Brands ({otherBrands.length})</p>
            <div className="relative mb-2">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
              </svg>
              <input type="text" value={roofSearch} onChange={e => setRoofSearch(e.target.value)} placeholder="Search brands…"
                className="w-full bg-white border border-[#E5E2DC] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 transition-all" />
            </div>
            <div className="max-h-48 overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl divide-y divide-[#F5F3F0]">
              {filteredOthers.map(b => (
                <label key={b.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 cursor-pointer transition-colors">
                  <input type="checkbox" checked={roofingSelected.has(b.name)} onChange={() => toggleRoofing(b.name)} className="accent-orange-500 w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700 flex-1">{b.name}</span>
                  <span className="text-xs text-gray-400">{b.count.toLocaleString()}</span>
                </label>
              ))}
              {filteredOthers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No brands found</p>}
            </div>
          </div>
        </div>
      )}

      {/* Gutters tab */}
      {(activeTab === 'gutters' || selectedTrades.length === 1 && selectedTrades[0] === 'gutters') && selectedTrades.includes('gutters') && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Select the gutter brands you stock. Universal accessories (Manufacturer Varies) are always included.</p>
          <SimpleBrandList brands={gutterBrands} selected={gutterSelected} onToggle={toggleGutter} />
        </div>
      )}

      {/* Siding tab */}
      {(activeTab === 'siding' || selectedTrades.length === 1 && selectedTrades[0] === 'siding') && selectedTrades.includes('siding') && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Select the siding brands you stock.</p>
          <SimpleBrandList brands={sidingBrands} selected={sidingSelected} onToggle={toggleSiding} />
        </div>
      )}

      <button onClick={handleContinue} disabled={!canContinue}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-full transition-colors text-base">
        Continue →
      </button>
      <button onClick={() => setStep(2)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back to trade selection
      </button>
    </div>
  )
}
