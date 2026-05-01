'use client'
import { useWizardStore } from '@/store/wizard-store'
import { Step1Connect } from './Step1Connect'
import { Step2Brands }  from './Step2Brands'
import { Step3Preview } from './Step3Preview'
import { Step4Validate } from './Step4Validate'
import { Step5Upload }  from './Step5Upload'
import { Step6Done }    from './Step6Done'

const STEPS = [
  { label: 'Connect',  short: 'Connect'  },
  { label: 'Brands',   short: 'Brands'   },
  { label: 'Preview',  short: 'Preview'  },
  { label: 'Validate', short: 'Validate' },
  { label: 'Upload',   short: 'Upload'   },
  { label: 'Done',     short: 'Done'     },
]


export function WizardShell() {
  const { step } = useWizardStore()

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
          <span className="bg-orange-50 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-full">
            Step {step} of {STEPS.length}
          </span>
        </div>
      </header>

      {/* Step indicator */}
      <div className="bg-white border-b border-[#E5E2DC]">
        <div className="max-w-[760px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const n = i + 1
              const done = step > n
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

      {/* Content */}
      <main className="max-w-[760px] mx-auto px-6 py-12">
        {step === 1 && <Step1Connect />}
        {step === 2 && <Step2Brands />}
        {step === 3 && <Step3Preview />}
        {step === 4 && <Step4Validate />}
        {step === 5 && <Step5Upload />}
        {step === 6 && <Step6Done />}
      </main>
    </div>
  )
}
