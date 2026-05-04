'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import type { BrandPackage, ProposalLineItem } from '@/types/wizard'

const TIER_LABELS = { good: 'Good', better: 'Better', best: 'Best' } as const
const TIER_COLORS = {
  good:   { bg: 'bg-gray-50',    border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-600',   heading: 'text-gray-700' },
  better: { bg: 'bg-orange-50',  border: 'border-orange-200', badge: 'bg-orange-100 text-orange-600', heading: 'text-orange-700' },
  best:   { bg: 'bg-amber-50',   border: 'border-amber-300',  badge: 'bg-amber-100 text-amber-700',   heading: 'text-amber-800' },
}

function LineItemRow({ item, isShingles }: { item: ProposalLineItem; isShingles: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${isShingles ? 'bg-orange-50 border border-orange-200' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${isShingles ? 'text-orange-600' : 'text-gray-400'} uppercase tracking-wide`}>
          {item.proposal_line_item}
        </p>
        <p className="text-sm text-gray-800 font-medium truncate">{item.product_name}</p>
      </div>
      {item.suggested_price != null && (
        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">${item.suggested_price.toLocaleString()}</span>
      )}
    </div>
  )
}

function PackageCard({ tier, items }: { tier: keyof typeof TIER_LABELS; items: ProposalLineItem[] }) {
  const c = TIER_COLORS[tier]
  const shingles = items.find(i => i.proposal_line_item === 'Shingles')
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4 space-y-2 flex-1`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-bold ${c.heading}`}>{TIER_LABELS[tier]}</span>
        {shingles?.suggested_price != null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
            ~${shingles.suggested_price}/sq
          </span>
        )}
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <LineItemRow key={i} item={item} isShingles={item.proposal_line_item === 'Shingles'} />
        ))}
      </div>
    </div>
  )
}

export function Step8Proposals() {
  const { selectedBrands, companyName, proposalPackages, setProposalPackages, setStep, reset } = useWizardStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeBrands, setActiveBrands] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/proposal-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBrands }),
    })
      .then(r => r.json())
      .then((d: Record<string, BrandPackage> & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setProposalPackages(d)
        setActiveBrands(new Set(Object.keys(d)))
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eligibleBrands = Object.keys(proposalPackages)

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">{error}</div>
  )

  if (eligibleBrands.length === 0) return (
    <div className="max-w-md mx-auto text-center space-y-4 py-12">
      <p className="text-gray-500">None of the imported brands have enough tier data for Good / Better / Best templates.</p>
      <button onClick={reset} className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors">
        Start New Import →
      </button>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Proposal Templates</h2>
        <p className="text-gray-500 mt-2">
          Good / Better / Best packages for <span className="font-medium text-orange-500">{companyName}</span>.{' '}
          {eligibleBrands.length} brand{eligibleBrands.length > 1 ? 's' : ''} eligible.
        </p>
      </div>

      {/* Brand selector */}
      <div className="flex flex-wrap gap-2">
        {eligibleBrands.map(brand => (
          <button
            key={brand}
            onClick={() => setActiveBrands(s => {
              const next = new Set(s)
              next.has(brand) ? next.delete(brand) : next.add(brand)
              return next
            })}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              activeBrands.has(brand)
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-500 border-[#E5E2DC] hover:border-gray-400'
            }`}
          >
            {brand}
          </button>
        ))}
      </div>

      {/* Package previews per brand */}
      {eligibleBrands.filter(b => activeBrands.has(b)).map(brand => {
        const pkg = proposalPackages[brand]
        return (
          <div key={brand} className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E2DC]">
              <p className="font-bold text-gray-900">{brand}</p>
              <p className="text-xs text-gray-400 mt-0.5">3 estimate templates will be created in Zuper</p>
            </div>
            <div className="p-4 flex gap-3">
              <PackageCard tier="good"   items={pkg.good}   />
              <PackageCard tier="better" items={pkg.better} />
              <PackageCard tier="best"   items={pkg.best}   />
            </div>
          </div>
        )
      })}

      {/* Coming soon note */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 text-sm text-orange-800">
        <p className="font-semibold">Template creation coming soon</p>
        <p className="mt-1 text-orange-700">The Zuper estimate template endpoint is being configured. Once available, clicking "Create in Zuper" will push these packages as estimate templates to the account.</p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep(7)}
          className="flex-1 h-12 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={reset}
          className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors"
        >
          Start New Import →
        </button>
      </div>
    </div>
  )
}
