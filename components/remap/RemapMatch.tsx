'use client'
import { useEffect, useRef, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { RemapRow } from '@/types/wizard'

type Phase = 'scan' | 'catalog' | 'score' | 'options'
const PHASE_LABEL: Record<Phase, string> = {
  scan: 'Reading existing products from Zuper…',
  catalog: 'Loading the SRS catalog…',
  score: 'Matching products against SRS…',
  options: 'Resolving available options…',
}

export function RemapMatch() {
  const { baseUrl, apiKey, companyName, setRemapRows, setRemapStep } = useWizardStore()
  const [phase, setPhase] = useState<Phase>('scan')
  const [scanned, setScanned] = useState({ page: 0, totalPages: 0 })
  const [candidateTotal, setCandidateTotal] = useState(0)
  const [scored, setScored] = useState(0)
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      try {
        const response = await fetch('/api/remap/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, apiKey }),
        })
        if (!response.ok || !response.body) throw new Error('Match request failed')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = JSON.parse(line.slice(6))

            if (data.type === 'phase') setPhase(data.phase as Phase)
            if (data.type === 'scan_progress') setScanned({ page: data.pageNumber, totalPages: data.totalPages })
            if (data.type === 'scan_done') setCandidateTotal(data.total ?? 0)
            if (data.type === 'score_progress') setScored(data.scored ?? 0)
            if (data.type === 'done') {
              if (data.error) { setError(data.error); return }
              setRemapRows((data.rows ?? []) as RemapRow[], data.alreadyMapped ?? 0)
            }
          }
        }
      } catch (e: unknown) {
        setError((e as Error).message)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          Matching failed: {error}
        </div>
        <button
          onClick={() => setRemapStep(1)}
          className="w-full h-11 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-sm"
        >
          ← Back to Connect
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Matching…</h2>
        <p className="text-gray-500 mt-1">
          Working on <span className="font-medium text-orange-500">{companyName}</span>
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-5 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-[#1A1A1A]">{PHASE_LABEL[phase]}</p>
        </div>

        {phase === 'scan' && scanned.totalPages > 0 && (
          <ProgressBar value={scanned.page} max={scanned.totalPages} label={`Page ${scanned.page} of ${scanned.totalPages}`} />
        )}

        {phase === 'score' && candidateTotal > 0 && (
          <ProgressBar value={scored} max={candidateTotal} label={`${scored} / ${candidateTotal} products scored`} />
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        This can take up to a minute on accounts with many products.
      </p>
    </div>
  )
}
