'use client'
import { useWizardStore } from '@/store/wizard-store'
import { AppHeader } from '@/components/ui/AppHeader'
import { RemapConnect } from './RemapConnect'
import { RemapMatch } from './RemapMatch'
import { RemapReview } from './RemapReview'
import { RemapApply } from './RemapApply'

const STEPS = ['Connect', 'Match', 'Review', 'Done']

export function RemapShell() {
  const { remapStep, goHome } = useWizardStore()

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <AppHeader
        subtitle="Remap options"
        onHome={goHome}
        right={
          <span className="bg-orange-50 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-full">
            Step {remapStep} of {STEPS.length}
          </span>
        }
      />

      {/* Step indicator */}
      <div className="bg-white border-b border-[#E5E2DC]">
        <div className="max-w-[760px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {STEPS.map((label, i) => {
              const n = i + 1
              const done = remapStep > n
              const active = remapStep === n
              return (
                <div key={label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1">
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      done ? 'bg-orange-500 text-white' :
                      active ? 'bg-white border-2 border-orange-500 text-orange-500' :
                               'bg-white border-2 border-gray-200 text-gray-300',
                    ].join(' ')}>
                      {done ? (
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : n}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-medium hidden sm:block ${active ? 'text-orange-500' : done ? 'text-gray-400' : 'text-gray-300'}`}>
                      {label}
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

      <main className={`mx-auto px-6 py-12 ${remapStep === 3 ? 'max-w-[980px]' : 'max-w-[760px]'}`}>
        {remapStep === 1 && <RemapConnect />}
        {remapStep === 2 && <RemapMatch />}
        {remapStep === 3 && <RemapReview />}
        {remapStep === 4 && <RemapApply />}
      </main>
    </div>
  )
}
