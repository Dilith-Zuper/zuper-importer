'use client'
import { useMemo, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import type { RemapRow, RemapConfidence, RemapSelection } from '@/types/wizard'

interface RowState { selected: boolean; chosenSrsId: number | null }

const CONF_META: Record<RemapConfidence, { label: string; pill: string; blurb: string }> = {
  exact:  { label: 'Exact',  pill: 'bg-green-100 text-green-700',  blurb: 'High-confidence matches — pre-selected.' },
  strong: { label: 'Strong', pill: 'bg-emerald-100 text-emerald-700', blurb: 'Confident matches — pre-selected.' },
  weak:   { label: 'Weak',   pill: 'bg-amber-100 text-amber-700',  blurb: 'Uncertain — review before selecting.' },
  none:   { label: 'No match', pill: 'bg-red-100 text-red-700',    blurb: 'No confident match — pick one manually or skip.' },
}
const ORDER: RemapConfidence[] = ['exact', 'strong', 'weak', 'none']

export function RemapReview() {
  const { remapRows, remapAlreadyMapped, companyName, setRemapSelections, setRemapStep } = useWizardStore()

  // Default: exact/strong checked on the best candidate; weak/none unchecked.
  const [state, setState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {}
    for (const r of remapRows) {
      const preselect = r.confidence === 'exact' || r.confidence === 'strong'
      init[r.zuperUid] = {
        selected: preselect && r.candidates.length > 0,
        chosenSrsId: r.candidates[0]?.srsId ?? null,
      }
    }
    return init
  })

  const grouped = useMemo(() => {
    const g: Record<RemapConfidence, RemapRow[]> = { exact: [], strong: [], weak: [], none: [] }
    for (const r of remapRows) g[r.confidence].push(r)
    return g
  }, [remapRows])

  const selectedCount = Object.values(state).filter(s => s.selected && s.chosenSrsId != null).length

  function setRow(uid: string, patch: Partial<RowState>) {
    setState(prev => ({ ...prev, [uid]: { ...prev[uid], ...patch } }))
  }

  function toggleGroup(conf: RemapConfidence, on: boolean) {
    setState(prev => {
      const next = { ...prev }
      for (const r of grouped[conf]) {
        next[r.zuperUid] = {
          chosenSrsId: prev[r.zuperUid]?.chosenSrsId ?? r.candidates[0]?.srsId ?? null,
          selected: on && (prev[r.zuperUid]?.chosenSrsId ?? r.candidates[0]?.srsId ?? null) != null,
        }
      }
      return next
    })
  }

  function apply() {
    const selections: RemapSelection[] = []
    for (const r of remapRows) {
      const st = state[r.zuperUid]
      if (!st?.selected || st.chosenSrsId == null) continue
      const cand = r.candidates.find(c => c.srsId === st.chosenSrsId)
      if (!cand) continue
      selections.push({ zuperUid: r.zuperUid, srsId: cand.srsId, srsCategory: cand.srsCategory })
    }
    setRemapSelections(selections)
    setRemapStep(4)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Review matches</h2>
        <p className="text-gray-500 mt-1">
          {remapRows.length.toLocaleString()} products from <span className="font-medium text-orange-500">{companyName}</span>.
          Confirm what gets the SRS options — only the color/size options are written, nothing else changes.
        </p>
        {remapAlreadyMapped > 0 && (
          <p className="text-sm text-gray-400 mt-1">
            {remapAlreadyMapped.toLocaleString()} product{remapAlreadyMapped === 1 ? '' : 's'} already mapped — hidden.
          </p>
        )}
      </div>

      {ORDER.map(conf => {
        const rows = grouped[conf]
        if (rows.length === 0) return null
        const meta = CONF_META[conf]
        const allOn = rows.every(r => state[r.zuperUid]?.selected)
        return (
          <section key={conf} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.pill}`}>{meta.label}</span>
                <span className="text-sm text-gray-500">{rows.length} · {meta.blurb}</span>
              </div>
              <button
                onClick={() => toggleGroup(conf, !allOn)}
                className="text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors"
              >
                {allOn ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E2DC] divide-y divide-[#F0EEE9] overflow-hidden">
              {rows.map(r => {
                const st = state[r.zuperUid]
                const chosen = r.candidates.find(c => c.srsId === st?.chosenSrsId) ?? r.candidates[0]
                return (
                  <div key={r.zuperUid} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!st?.selected}
                      disabled={r.candidates.length === 0}
                      onChange={e => setRow(r.zuperUid, { selected: e.target.checked })}
                      className="mt-1 w-4 h-4 accent-orange-500 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1A1A1A] truncate" title={r.zuperName}>
                        {r.zuperName}
                        {r.fastPath && <span className="ml-2 text-[10px] font-medium text-gray-400 uppercase">already mapped</span>}
                      </p>

                      {r.candidates.length === 0 ? (
                        <p className="text-xs text-gray-400 mt-1">No SRS candidate found.</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mt-1">
                            <select
                              value={st?.chosenSrsId ?? ''}
                              onChange={e => setRow(r.zuperUid, { chosenSrsId: Number(e.target.value), selected: true })}
                              className="max-w-full text-xs text-gray-700 bg-[#FAF9F7] border border-[#E5E2DC] rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                            >
                              {r.candidates.map(c => (
                                <option key={c.srsId} value={c.srsId}>
                                  {c.srsName} · {c.srsCategory || '—'} · {c.score.toFixed(2)}
                                </option>
                              ))}
                            </select>
                          </div>
                          {chosen && (
                            <p className="text-xs text-gray-500 mt-1 truncate" title={chosen.optionsPreview}>
                              {chosen.optionsPreview}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="sticky bottom-0 bg-[#FAF9F7] pt-4 pb-2 -mx-6 px-6 border-t border-[#E5E2DC]">
        <button
          onClick={apply}
          disabled={selectedCount === 0}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors text-base"
        >
          Apply options to {selectedCount.toLocaleString()} product{selectedCount === 1 ? '' : 's'} →
        </button>
      </div>
    </div>
  )
}
