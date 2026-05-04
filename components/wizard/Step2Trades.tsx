'use client'
import { useWizardStore } from '@/store/wizard-store'
import type { Trade } from '@/types/wizard'

const TRADE_DEFS: { id: Trade; label: string; description: string; count: string; brands: string; icon: string }[] = [
  {
    id: 'roofing',
    label: 'Roofing',
    description: 'Shingles, underlayment, flashings, vents, and all roofing accessories',
    count: '19,807',
    brands: 'GAF · CertainTeed · Owens Corning · IKO · Atlas',
    icon: '🏠',
  },
  {
    id: 'gutters',
    label: 'Gutters',
    description: 'K-style and half-round gutters, downspouts, elbows, hangers, and coil stock',
    count: '1,230',
    brands: 'Berger · Englert · US Aluminum · Rainstamp · Quality Edge',
    icon: '🪣',
  },
  {
    id: 'siding',
    label: 'Siding',
    description: 'Vinyl, fiber cement, and composite siding panels, trim, and accessories',
    count: '2,438',
    brands: 'James Hardie · CertainTeed · Mastic · Azek · Royal',
    icon: '🏘',
  },
]

export function Step2Trades() {
  const { companyName, selectedTrades, setSelectedTrades, setStep } = useWizardStore()

  const toggle = (id: Trade) => {
    const current = new Set(selectedTrades)
    if (current.has(id)) {
      if (current.size === 1) return // must keep at least one
      current.delete(id)
    } else {
      current.add(id)
    }
    setSelectedTrades(Array.from(current) as Trade[])
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">What are you importing?</h2>
        <p className="text-gray-500 mt-2">
          Select the trades to upload into{' '}
          <span className="font-medium text-orange-500">{companyName}</span>.
          Roofing is pre-selected.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {TRADE_DEFS.map(trade => {
          const selected = selectedTrades.includes(trade.id)
          return (
            <button
              key={trade.id}
              onClick={() => toggle(trade.id)}
              className={[
                'relative text-left rounded-2xl border-2 p-6 transition-all',
                selected
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-[#E5E2DC] bg-white hover:border-gray-300',
              ].join(' ')}
            >
              {/* Checkmark */}
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
                <span className="text-3xl flex-shrink-0 mt-0.5">{trade.icon}</span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <p className={`text-lg font-bold ${selected ? 'text-orange-700' : 'text-gray-900'}`}>
                      {trade.label}
                    </p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${selected ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                      {trade.count} products
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{trade.description}</p>
                  <p className="text-xs text-gray-400 font-medium">{trade.brands}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setStep(3)}
        disabled={selectedTrades.length === 0}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-full transition-colors text-base"
      >
        Continue with {selectedTrades.map(t => TRADE_DEFS.find(d => d.id === t)!.label).join(' + ')} →
      </button>

      <button onClick={() => setStep(1)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back to Connect
      </button>
    </div>
  )
}
