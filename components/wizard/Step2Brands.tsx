'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { BrandTile } from '@/components/ui/BrandTile'

interface BrandItem { name: string; count: number; isBig3: boolean }

export function Step2Brands() {
  const { companyName, setSelectedBrands, setStep } = useWizardStore()
  const [big3, setBig3] = useState<BrandItem[]>([])
  const [topSecondary, setTopSecondary] = useState<BrandItem[]>([])
  const [otherBrands, setOtherBrands] = useState<BrandItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then(d => {
      const b3: BrandItem[] = d.big3 ?? []
      setBig3(b3)
      setTopSecondary(d.topSecondary ?? [])
      setOtherBrands(d.otherBrands ?? [])
      setSelected(new Set(b3.map((b: BrandItem) => b.name)))
      setLoading(false)
    })
  }, [])

  const toggle = (name: string) => setSelected(s => {
    const next = new Set(s)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

  const filteredOthers = otherBrands.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleContinue() {
    setSelectedBrands(Array.from(selected))
    setStep(3)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Which brands do you carry?</h2>
        <p className="text-gray-500 mt-2">Universal accessories are always included regardless of brand selection</p>
        <p className="text-sm text-gray-400 mt-0.5">Connected to <span className="font-medium text-orange-500">{companyName}</span></p>
      </div>

      {/* Big 3 */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Always Included</p>
        <div className="grid grid-cols-3 gap-3">
          {big3.map(b => (
            <BrandTile key={b.name} name={b.name} count={b.count} selected={selected.has(b.name)} onClick={() => toggle(b.name)} />
          ))}
        </div>
      </div>

      {/* Top secondary */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Popular Secondary Brands</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {topSecondary.map(b => (
            <BrandTile key={b.name} name={b.name} count={b.count} selected={selected.has(b.name)} onClick={() => toggle(b.name)} />
          ))}
        </div>
      </div>

      {/* Search others */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Other Brands ({otherBrands.length})</p>
        <div className="relative mb-2">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brands…"
            className="w-full bg-white border border-[#E5E2DC] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
          />
        </div>
        <div className="max-h-48 overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl divide-y divide-[#F5F3F0]">
          {filteredOthers.map(b => (
            <label key={b.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={selected.has(b.name)}
                onChange={() => toggle(b.name)}
                className="accent-orange-500 w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 flex-1">{b.name}</span>
              <span className="text-xs text-gray-400">{b.count.toLocaleString()}</span>
            </label>
          ))}
          {filteredOthers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No brands found</p>
          )}
        </div>
      </div>

      <button
        onClick={handleContinue}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
      >
        Continue →
      </button>
    </div>
  )
}
