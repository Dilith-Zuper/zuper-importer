'use client'
import { useEffect, useRef, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { ProgressBar } from '@/components/ui/ProgressBar'

interface LogEntry { name: string; ok: boolean; message?: string }

export function Step6Upload() {
  const {
    apiKey, baseUrl, filteredProductIds, categoryMap, warehouseUid, formulaMap, productTierFieldUid, companyName, setUploadSummary,
  } = useWizardStore()

  const [uploaded, setUploaded] = useState(0)
  const [errors, setErrors] = useState<{ productId: number; productName: string; message: string }[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [done, setDone] = useState(false)
  const [batchInfo, setBatchInfo] = useState({ current: 0, total: 0 })
  const startedRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, apiKey, productIds: filteredProductIds, categoryMap, warehouseUid, formulaMap, productTierFieldUid }),
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
              setUploaded(data.uploaded ?? 0)
              setLog(prev => [...prev.slice(-200), { name: data.productName, ok: data.status === 'success', message: data.message }])
              logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }
            if (data.type === 'batch_complete') {
              setBatchInfo({ current: data.batch, total: data.of })
            }
            if (data.type === 'done') {
              setDone(true)
              const errs = data.errors ?? []
              setErrors(errs)
              setUploadSummary({ uploaded: data.uploaded ?? 0, skipped: data.skipped ?? 0, errors: errs, productIdMap: data.productIdMap ?? {} })
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
    const csv = ['Product Name,Error', ...errors.map(e => `"${e.productName.replace(/"/g, '""')}","${e.message.replace(/"/g, '""')}"`)]
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'upload-errors.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const remaining = filteredProductIds.length - uploaded - errors.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">
          {done ? 'Import complete' : 'Importing products…'}
        </h2>
        <p className="text-gray-500 mt-1">
          Uploading to <span className="font-medium text-orange-500">{companyName}</span>
        </p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-5 space-y-3">
        <ProgressBar value={uploaded} max={filteredProductIds.length} />
        <p className="text-xs text-gray-400 text-center">
          {uploaded.toLocaleString()} / {filteredProductIds.length.toLocaleString()} products
          {batchInfo.total > 0 && ` · Batch ${batchInfo.current} of ${batchInfo.total}`}
        </p>
      </div>

      {/* Two-column: log + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
        {/* Live log */}
        <div className="bg-[#1C1917] rounded-2xl p-4 h-52 overflow-y-auto font-[family-name:var(--font-geist-mono)] text-xs space-y-0.5">
          {log.map((entry, i) => (
            <div key={i} className={entry.ok ? 'text-orange-400' : 'text-red-400'}>
              {entry.ok ? '✓' : '✗'} {entry.name}{entry.message ? ` — ${entry.message}` : ''}
            </div>
          ))}
          {log.length === 0 && <div className="text-gray-600">Waiting for upload to start…</div>}
          <div ref={logEndRef} />
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 flex-1 text-center">
            <p className="text-3xl font-bold text-green-600">{uploaded.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Uploaded</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 flex-1 text-center">
            <p className="text-3xl font-bold text-red-500">{errors.length.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Failed</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 flex-1 text-center">
            <p className="text-3xl font-bold text-gray-400">{Math.max(0, remaining).toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Remaining</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">Uploading in batches of 100 · 3s between batches</p>

      {done && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-700 text-center font-semibold">
            Upload complete — {uploaded.toLocaleString()} products imported{errors.length > 0 ? `, ${errors.length} errors` : ''}
          </div>
          {errors.length > 0 && (
            <button onClick={downloadErrors} className="w-full h-11 border border-red-300 text-red-600 font-semibold rounded-full hover:bg-red-50 transition-colors text-sm">
              Download Error List (CSV)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
