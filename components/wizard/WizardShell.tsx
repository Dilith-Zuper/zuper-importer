'use client'
import { useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { NoToast } from '@/components/ui/NoToast'
import { GuidePanel } from '@/components/ui/GuidePanel'
import { Step1Connect }      from './Step1Connect'
import { Step2Trades }       from './Step2Trades'
import { Step3Brands }       from './Step3Brands'
import { Step4ProductLines } from './Step4ProductLines'
import { Step4Preview }      from './Step4Preview'
import { Step5Validate }     from './Step5Validate'
import { Step6Upload }       from './Step6Upload'
import { Step7Done }         from './Step7Done'
import { Step9Proposals }    from './Step9Proposals'

const STEPS = [
  { label: 'Connect',   short: 'Connect'  },
  { label: 'Trades',    short: 'Trades'   },
  { label: 'Brands',    short: 'Brands'   },
  { label: 'Lines',     short: 'Lines'    },
  { label: 'Preview',   short: 'Preview'  },
  { label: 'Validate',  short: 'Validate' },
  { label: 'Upload',    short: 'Upload'   },
  { label: 'Done',      short: 'Done'     },
  { label: 'Templates', short: 'Templates'},
]

export function WizardShell() {
  const { step } = useWizardStore()
  const [toastReason, setToastReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  async function askDoubt() {
    setGuideOpen(true)
    if (loading) return
    setLoading(true)
    try {
      const d = await fetch('/api/no').then(r => r.json())
      setToastReason(d.reason ?? '')
    } catch { setToastReason('No answer available right now.') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E2DC] h-16 flex items-center px-6">
        <div className="w-full max-w-[760px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/zuper-logo.svg" alt="Zuper" height={28} className="h-7 w-auto" />
            <span className="text-[#E5E2DC] select-none">|</span>
            <span className="text-sm font-medium text-gray-500">SRS Product Importer</span>
            <span className="text-[#E5E2DC] select-none">·</span>
            <span className="text-sm text-gray-400">{STEPS[step - 1]?.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={askDoubt}
              disabled={loading}
              className="text-xs font-medium text-gray-400 hover:text-orange-500 transition-colors disabled:opacity-50 underline underline-offset-2"
            >
              {loading ? 'Asking…' : 'Do you have any doubts? Ask here'}
            </button>
            <span className="bg-orange-50 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-full">
              Step {step} of {STEPS.length}
            </span>
          </div>
        </div>
      </header>

      {/* Step indicator */}
      <div className="bg-white border-b border-[#E5E2DC]">
        <div className="max-w-[760px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const n = i + 1
              const done   = step > n
              const active = step === n
              return (
                <div key={s.label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1">
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      done   ? 'bg-orange-500 text-white' :
                      active ? 'bg-white border-2 border-orange-500 text-orange-500' :
                               'bg-white border-2 border-gray-200 text-gray-300',
                    ].join(' ')}>
                      {done ? (
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : n}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-medium hidden sm:block ${active ? 'text-orange-500' : done ? 'text-gray-400' : 'text-gray-300'}`}>
                      {s.short}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-2 ${done ? 'bg-orange-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Guide panel */}
      <GuidePanel step={step} open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Toast */}
      {toastReason !== null && (
        <NoToast reason={toastReason} onDismiss={() => setToastReason(null)} />
      )}

      {/* Content */}
      <main className="max-w-[760px] mx-auto px-6 py-12">
        {step === 1 && <Step1Connect />}
        {step === 2 && <Step2Trades />}
        {step === 3 && <Step3Brands />}
        {step === 4 && <Step4ProductLines />}
        {step === 5 && <Step4Preview />}
        {step === 6 && <Step5Validate />}
        {step === 7 && <Step6Upload />}
        {step === 8 && <Step7Done />}
        {step === 9 && <Step9Proposals />}
      </main>
    </div>
  )
}
