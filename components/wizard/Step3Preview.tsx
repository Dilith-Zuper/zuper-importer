'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'

const CATEGORY_ORDER = [
  'Shingles',
  'Hip & Ridge Cap',
  'Starter Strip',
  'Underlayment — Synthetic',
  'Underlayment — Felt 30#',
  'Underlayment — Self-Adhered HT',
  'Ice & Water — Standard',
  'Ice & Water — High Temp',
  'Ridge Vent',
  'Box Vent',
  'Power Vent / Attic Fan',
  'Dryer / Exhaust Vent Cap',
  'Drip Edge',
  'Step Flashing',
  'Counter / Headwall Flashing',
  'Chimney Flashing Kit',
  'W-Valley',
  'Lead Flashing',
  'Coil Stock / Sheet Metal',
  'Coil Nails',
  'Plastic Cap Nails',
  'Fasteners',
  'Pipe Boot 3"',
  'Pipe Boot 4"',
  'Skylight',
  'Roof Decking (OSB)',
  'Caulk / Sealant',
  'Spray Paint',
  'Gutter Sections',
  'Gutter Elbows',
  'Gutter Apron',
  'Gutter End Caps',
  'Gutter Inside Corners',
  'Gutter Outside Corners',
  'Downspouts',
  'Siding',
  'Commercial Membrane (TPO/EPDM)',
  'TOOLS/SAFETY',
  'OTHER',
]

const CATEGORY_NORM: Record<string, string> = {
  'SHINGLES':              'Shingles',
  'HIP AND RIDGE':         'Hip & Ridge Cap',
  'STARTER':               'Starter Strip',
  'UNDERLAYMENT':          'Underlayment — Synthetic',
  'ICE AND WATER':         'Ice & Water — Standard',
  'VENTS':                 'Box Vent',
  'OTHER FASTENERS':       'Fasteners',
  'COIL NAILS':            'Coil Nails',
  'DECKING':               'Roof Decking (OSB)',
  'DRIP EDGE':             'Drip Edge',
  'OTHER FLASHING METAL':  'Step Flashing',
  'PIPE FLASHING':         'Pipe Boot 3"',
  'CAULK':                 'Caulk / Sealant',
  'SPRAY PAINT':           'Spray Paint',
  'COMMERCIAL':            'Commercial Membrane (TPO/EPDM)',
  'SIDING':                'Siding',
  'GUTTER/ALUMINUM/COIL':  'Gutter Sections',
  'TOOLS/SAFETY':          'TOOLS/SAFETY',
  'OTHER':                 'OTHER',
}

function normalizeCategory(proposalLineItem: string | null, productCategory: string): string {
  if (proposalLineItem) return proposalLineItem
  return CATEGORY_NORM[productCategory] ?? productCategory
}

function sortGroups(entries: [string, Product[]][]): [string, Product[]][] {
  return entries.sort(([a], [b]) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

interface Product {
  product_id: number
  product_name: string
  product_category: string
  manufacturer_norm: string | null
  family_tier: string | null
  proposal_line_item: string | null
  suggested_price: number | null
}

export function Step3Preview() {
  const { selectedBrands, companyName, setPreview, setStep } = useWizardStore()
  const [products, setProducts] = useState<Product[]>([])
  const [counts, setCounts] = useState<{ total: number; byCategory: Record<string, number> }>({ total: 0, byCategory: {} })
  const [activeBrand, setActiveBrand] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBrands }),
    }).then(r => r.json()).then(d => {
      setProducts(d.products ?? [])
      setCounts(d.counts ?? { total: 0, byCategory: {} })
      setLoading(false)
    })
  }, [selectedBrands])

  const brandCounts: Record<string, number> = {}
  for (const p of products) {
    const b = p.manufacturer_norm ?? 'Generic'
    brandCounts[b] = (brandCounts[b] ?? 0) + 1
  }

  const brandTabs = [
    { key: 'all', label: 'All', count: products.length },
    ...selectedBrands
      .filter(b => brandCounts[b])
      .map(b => ({ key: b, label: b, count: brandCounts[b] ?? 0 }))
      .sort((a, b) => b.count - a.count),
    ...(brandCounts['Generic'] ? [{ key: 'Generic', label: 'Generic / Varies', count: brandCounts['Generic'] }] : []),
  ]

  const filtered = activeBrand === 'all'
    ? products
    : activeBrand === 'Generic'
    ? products.filter(p => !p.manufacturer_norm || p.manufacturer_norm.toLowerCase().includes('manufacturer varies'))
    : products.filter(p => p.manufacturer_norm === activeBrand)

  const groups: Record<string, Product[]> = {}
  for (const p of filtered) {
    const key = normalizeCategory(p.proposal_line_item, p.product_category)
    ;(groups[key] ??= []).push(p)
  }

  function handleConfirm() {
    setPreview(products.map(p => p.product_id), counts)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Your product catalog preview</h2>
        <p className="text-gray-500 mt-1">For <span className="font-medium text-orange-500">{companyName}</span></p>
      </div>

      {/* Stats card */}
      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-6 text-center">
        <p className="text-5xl font-extrabold text-orange-500">{counts.total.toLocaleString()}</p>
        <p className="text-gray-400 mt-1">products across <span className="text-gray-600 font-semibold">{Object.keys(counts.byCategory).length}</span> categories</p>
      </div>

      {/* Brand tabs */}
      <div className="flex gap-2 flex-wrap">
        {brandTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveBrand(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeBrand === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-white border border-[#E5E2DC] text-gray-600 hover:border-gray-400'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs ${activeBrand === tab.key ? 'opacity-80' : 'text-gray-400'}`}>
              {tab.count.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden max-h-[420px] overflow-y-auto">
        {sortGroups(Object.entries(groups)).map(([group, items], idx) => (
          <details key={group} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FAF9F7]'}>
            <summary className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-orange-50 transition-colors border-b border-[#E5E2DC] last:border-0">
              <span className="font-semibold text-gray-800 text-sm">{group}</span>
              <span className="bg-orange-50 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-full ml-4 flex-shrink-0">
                {items.length.toLocaleString()}
              </span>
            </summary>
            <div className="divide-y divide-[#F5F3F0]">
              {items.slice(0, 20).map(p => (
                <div key={p.product_id} className="px-5 py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 text-gray-700">{p.product_name}</span>
                  <span className="text-gray-400 text-xs flex-shrink-0">{p.manufacturer_norm ?? ''}</span>
                </div>
              ))}
              {items.length > 20 && (
                <div className="px-5 py-2 text-xs text-gray-400">…and {items.length - 20} more</div>
              )}
            </div>
          </details>
        ))}
      </div>

      <button
        onClick={handleConfirm}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
      >
        Confirm &amp; Run Pre-flight Checks →
      </button>

      <button onClick={() => setStep(2)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back to brand selection
      </button>
    </div>
  )
}
