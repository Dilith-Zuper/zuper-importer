'use client'
import { useWizardStore } from '@/store/wizard-store'
import { AppHeader } from '@/components/ui/AppHeader'

export function Landing() {
  const setMode = useWizardStore(s => s.setMode)

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <AppHeader />
      <main className="max-w-[760px] mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">What would you like to do?</h1>
          <p className="text-base text-gray-500 mt-2">Pick a task to get started.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Import the SRS catalog (existing wizard) */}
          <button
            onClick={() => setMode('import')}
            className="group text-left bg-white rounded-2xl border border-[#E5E2DC] p-6 hover:border-orange-300 transition-colors"
          >
            <div className="w-11 h-11 rounded-full bg-orange-50 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#1A1A1A]">Import SRS catalog</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Load brands and product lines from the SRS catalog into a Zuper account and build Good/Better/Best proposal templates.
            </p>
            <span className="inline-block mt-4 text-orange-500 font-semibold text-sm group-hover:text-orange-600 transition-colors">
              Start import →
            </span>
          </button>

          {/* Remap options for existing products (new flow) */}
          <button
            onClick={() => setMode('remap')}
            className="group text-left bg-white rounded-2xl border border-[#E5E2DC] p-6 hover:border-orange-300 transition-colors"
          >
            <div className="w-11 h-11 rounded-full bg-orange-50 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#1A1A1A]">Remap options for existing products</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Match an account&apos;s existing products against the SRS catalog and add the matching color and size options to them.
            </p>
            <span className="inline-block mt-4 text-orange-500 font-semibold text-sm group-hover:text-orange-600 transition-colors">
              Start remapping →
            </span>
          </button>
        </div>
      </main>
    </div>
  )
}
