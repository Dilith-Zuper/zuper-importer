'use client'
import { useState, useEffect } from 'react'
import { GUIDES } from '@/lib/guide-content'

interface Props {
  step: number
  open: boolean
  onClose: () => void
}

export function GuidePanel({ step, open, onClose }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const guide = GUIDES[step]

  // Reset FAQ state when step changes
  useEffect(() => { setOpenFaq(null) }, [step])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!guide) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-80 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#E5E2DC] flex-shrink-0">
          <div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full mb-2">
              Step {step} guide
            </span>
            <h2 className="text-[17px] font-extrabold text-[#1A1A1A] leading-snug">{guide.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-3 mt-0.5 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            aria-label="Close guide"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Description */}
          <p className="text-sm text-gray-500 leading-relaxed">{guide.description}</p>

          {/* Steps */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">How it works</p>
            <ol className="space-y-4">
              {guide.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#1A1A1A]">{s.heading}</p>
                    <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* FAQs */}
          {guide.faqs.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Common questions</p>
              <div className="space-y-2">
                {guide.faqs.map((faq, i) => (
                  <div key={i} className="border border-[#E5E2DC] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#FAF9F7] transition-colors"
                    >
                      <span className="text-sm font-medium text-[#1A1A1A] pr-3 leading-snug">{faq.q}</span>
                      <svg
                        className={`flex-shrink-0 w-4 h-4 text-gray-400 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openFaq === i && (
                      <div className="px-4 pb-4 pt-1 bg-[#FAF9F7] border-t border-[#E5E2DC]">
                        <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-[#E5E2DC]">
          <button
            onClick={onClose}
            className="w-full h-10 bg-[#1A1A1A] hover:bg-black text-white text-sm font-semibold rounded-full transition-colors"
          >
            Got it, close guide
          </button>
        </div>
      </aside>
    </>
  )
}
