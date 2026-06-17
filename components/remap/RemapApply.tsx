'use client'
import { useEffect, useRef, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { ProgressBar } from '@/components/ui/ProgressBar'

interface LogEntry { name: string; ok: boolean; message?: string }

export function RemapApply() {
  const { baseUrl, apiKey, companyName, remapSelections, setRemapSummary, setRemapStep, goHome } = useWizardStore()

  const [updated, setUpdated] = useState(0)
  const [failed, setFailed] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<{ zuperUid: string; productName: string; message: string }[]>([])
  const startedRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const total = remapSelections.length

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      try {
        const response = await fetch('/api/remap/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, apiKey, selections: remapSelections }),
        })
        if (!response.ok || !response.body) { setDone(true); return }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = JSON.parse(line.slice(6))

            if (data.type === 'progress') {
              setUpdated(data.updated ?? 0)
              setFailed(data.failed ?? 0)
              setLog(prev => [...prev.slice(-200), { name: data.productName, ok: data.status === 'updated', message: data.message }])
              logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }
            if (data.type === 'done') {
              setDone(true)
              const errs = data.errors ?? []
              setErrors(errs)
              setUpdated(data.updated ?? 0)
              setFailed(data.failed ?? 0)
              setRemapSummary({ updated: data.updated ?? 0, failed: data.failed ?? 0, errors: errs })
            }
          }
        }
      } catch {
        setDone(true)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function downloadErrors() {
    const BOM = '﻿'
    const csv = BOM + ['Product Name,Error', ...errors.map(e => {
      const name = (e.productName ?? '').trim() || '(unnamed product)'
      const message = (e.message ?? '').replace(/[\r\n]+/g, ' ')
      return `"${name.replace(/"/g, '""')}","${message.replace(/"/g, '""')}"`
    })].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'remap-errors.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const remaining = Math.max(0, total - updated - failed)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">
          {done ? 'Remap complete' : 'Applying options…'}
        </h2>
        <p className="text-gray-500 mt-1">
          Updating <span className="font-medium text-orange-500">{companyName}</span> · options only
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-5 space-y-3">
        <ProgressBar value={updated + failed} max={total} label={`${updated + failed} / ${total} products processed`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
        <div className="bg-[#1C1917] rounded-2xl p-4 h-52 overflow-y-auto font-[family-name:var(--font-geist-mono)] text-xs space-y-0.5">
          {log.map((entry, i) => (
            <div key={i} className={entry.ok ? 'text-orange-400' : 'text-red-400'}>
              {entry.ok ? '✓' : '✗'} {entry.name}{entry.message ? ` — ${entry.message}` : ''}
            </div>
          ))}
          {log.length === 0 && <div className="text-gray-600">Waiting…</div>}
          <div ref={logEndRef} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 flex-1 text-center">
            <p className="text-3xl font-bold text-green-600">{updated.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Updated</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 flex-1 text-center">
            <p className="text-3xl font-bold text-red-500">{failed.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Failed</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 flex-1 text-center">
            <p className="text-3xl font-bold text-gray-400">{remaining.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Remaining</p>
          </div>
        </div>
      </div>

      {done && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-700 text-center font-semibold">
            Remap complete — options updated on {updated.toLocaleString()} product{updated === 1 ? '' : 's'}
            {failed > 0 ? `, ${failed} failed` : ''}
          </div>
          {errors.length > 0 && (
            <button onClick={downloadErrors} className="w-full h-11 border border-red-300 text-red-600 font-semibold rounded-full hover:bg-red-50 transition-colors text-sm">
              Download error list (CSV)
            </button>
          )}
          <button
            onClick={() => setRemapStep(3)}
            className="w-full h-11 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-sm"
          >
            ← Back to review
          </button>
          <button
            onClick={goHome}
            className="w-full h-12 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-base"
          >
            Done — back to home
          </button>
        </div>
      )}
    </div>
  )
}
