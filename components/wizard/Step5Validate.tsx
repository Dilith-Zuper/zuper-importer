'use client'
import { useEffect, useRef, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { ChecklistItem } from '@/components/ui/ChecklistItem'
import type { ValidationResult, TokenInfo } from '@/types/wizard'

const CHECK_LABELS: Record<string, string> = {
  categories: 'Product Categories',
  warehouse:  'Warehouse Location',
  tokens:     'Measurement Tokens',
  formulas:   'CPQ Formulas',
  uoms:       'Units of Measure',
  tier_field: 'Product Tier Custom Field',
}

const CHECK_ORDER = ['categories', 'warehouse', 'tokens', 'formulas', 'uoms', 'tier_field'] as const

export function Step5Validate() {
  const { apiKey, baseUrl, filteredProductIds, companyName, setValidationResult, setValidationData, setStep } = useWizardStore()
  const [results, setResults] = useState<Record<string, ValidationResult>>({})
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const init: Record<string, ValidationResult> = {}
    for (const c of CHECK_ORDER) {
      init[c] = { check: c, status: 'pending', detail: '' }
    }
    setResults(init)

    ;(async () => {
      try {
        const response = await fetch('/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, apiKey, productIds: filteredProductIds }),
        })

        if (!response.ok || !response.body) {
          setError('Failed to connect to validation endpoint.')
          setDone(true)
          return
        }

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

            if (data.check === 'done') {
              setDone(true)
              if (data.error) {
                setError(data.error)
              } else {
                setValidationData({
                  categoryMap: data.categoryMap,
                  warehouseUid: data.warehouseUid,
                  tokenMap: data.tokenMap as Record<string, TokenInfo>,
                  formulaMap: data.formulaMap,
                  productTierFieldUid: data.productTierFieldUid ?? '',
                })
              }
              continue
            }

            setResults(prev => ({ ...prev, [data.check]: data as ValidationResult }))
            setValidationResult(data as ValidationResult)
          }
        }
      } catch (e: unknown) {
        setError((e as Error).message)
        setDone(true)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const REQUIRED_CHECKS = CHECK_ORDER.filter(c => c !== 'tier_field')
  const allPassed = REQUIRED_CHECKS.every(c => results[c]?.status === 'pass')

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Pre-flight checks</h2>
        <p className="text-gray-500 mt-2">Verifying your Zuper account before import</p>
      </div>

      <div className="space-y-3">
        {CHECK_ORDER.map(check => {
          const r = results[check]
          return (
            <ChecklistItem
              key={check}
              label={CHECK_LABELS[check]}
              status={r?.status ?? 'pending'}
              detail={r?.detail}
            />
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          <p className="font-semibold">Validation failed</p>
          <p className="mt-1 text-red-600">{error}</p>
        </div>
      )}

      {done && allPassed && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-700 font-semibold text-center">
            ✓ All checks passed — Ready to import {filteredProductIds.length.toLocaleString()} products to {companyName}
          </div>
          <button
            onClick={() => setStep(6)}
            className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
          >
            Begin Upload →
          </button>
        </div>
      )}
    </div>
  )
}
