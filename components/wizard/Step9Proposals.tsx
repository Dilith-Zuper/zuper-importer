'use client'
import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import type { BrandPackage, ProposalLineItem } from '@/types/wizard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreflightState {
  categoryUid: string; categoryName: string
  statusUid: string;   statusName: string
  layoutUid: string;   layoutName: string
}

type Phase = 'preflight' | 'preview' | 'creating' | 'done'

const TIER_LABELS  = { good: 'Good', better: 'Better', best: 'Best' } as const
const TIER_BORDER  = { good: 'border-gray-200', better: 'border-orange-300', best: 'border-amber-400' }
const TIER_HEADING = { good: 'text-gray-600',   better: 'text-orange-600',   best: 'text-amber-700'  }

// ─── Sub-components ──────────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin flex-shrink-0" />
}

function PickerModal({ title, items, onPick }: { title: string; items: { uid: string; name: string }[]; onPick: (uid: string, name: string) => void }) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-800">{title}</p>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {items.map(item => (
          <button key={item.uid} onClick={() => onPick(item.uid, item.name)}
            className="w-full text-left px-3 py-2 text-sm bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors">
            {item.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function LineItemRow({ item }: { item: ProposalLineItem }) {
  const isShingles = item.proposal_line_item === 'Shingles'
  return (
    <div className={`flex items-start gap-2 py-1.5 px-2 rounded-lg ${isShingles ? 'bg-orange-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${isShingles ? 'text-orange-400' : 'text-gray-400'}`}>{item.proposal_line_item}</p>
        <p className="text-xs text-gray-800 font-medium leading-tight truncate">{item.product_name}</p>
      </div>
      {item.suggested_price != null && <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1">${item.suggested_price}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Step9Proposals() {
  const {
    selectedBrands, selectedProductLines, companyName,
    selectedTrades,
    selectedGutterBrands, selectedGutterProductLines,
    selectedSidingBrands, selectedSidingProductLines,
    proposalPackages, setProposalPackages,
    gutterProposalItems, setGutterProposalItems,
    sidingProposalItems, setSidingProposalItems,
    formulaMap, productIdMap,
    setStep, reset,
    baseUrl, apiKey,
  } = useWizardStore()

  const [phase, setPhase] = useState<Phase>('preflight')
  const [preflightLoading, setPreflightLoading] = useState(true)
  const [preflight, setPreflight] = useState<Partial<PreflightState>>({})
  const [categoryOptions, setCategoryOptions] = useState<{ uid: string; name: string }[]>([])
  const [statusOptions, setStatusOptions]     = useState<{ uid: string; name: string }[]>([])
  const [layoutOptions, setLayoutOptions]     = useState<{ uid: string; name: string }[]>([])

  const [packageLoading, setPackageLoading] = useState(false)
  const [templateNames, setTemplateNames]   = useState<Record<string, string>>({})
  const [templateDescs, setTemplateDescs]   = useState<Record<string, string>>({})
  const [activeBrands, setActiveBrands]     = useState<Set<string>>(new Set())

  const [creationLog, setCreationLog] = useState<{ brand: string; status: string; msg?: string }[]>([])
  const [creationDone, setCreationDone] = useState(false)

  // ── Phase A: Pre-flight ────────────────────────────────────────────────────

  useEffect(() => { runPreflight() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function runPreflight(overrideCategoryUid?: string) {
    setPreflightLoading(true)
    try {
      const d = await fetch('/api/proposal-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, categoryUid: overrideCategoryUid }),
      }).then(r => r.json())
      setPreflight({
        categoryUid: d.categoryUid || undefined, categoryName: d.categoryName || undefined,
        statusUid:   d.statusUid   || undefined, statusName:   d.statusName   || undefined,
        layoutUid:   d.layoutUid   || undefined, layoutName:   d.layoutName   || undefined,
      })
      if (d.categoryOptions?.length) setCategoryOptions(d.categoryOptions)
      if (d.statusOptions?.length)   setStatusOptions(d.statusOptions)
      if (d.layoutOptions?.length)   setLayoutOptions(d.layoutOptions)
    } catch { /* network error */ }
    setPreflightLoading(false)
  }

  const allPreflightReady = !!(preflight.categoryUid && preflight.statusUid)

  useEffect(() => {
    if (allPreflightReady && phase === 'preflight') loadPackages()
  }, [preflight]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase B: Load packages ─────────────────────────────────────────────────

  async function loadPackages() {
    setPackageLoading(true)
    setPhase('preview')
    const d = await fetch('/api/proposal-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedBrands, selectedProductLines,
        selectedTrades,
        selectedGutterBrands, selectedGutterProductLines,
        selectedSidingBrands, selectedSidingProductLines,
      }),
    }).then(r => r.json())

    if (!d.error) {
      const gutters: ProposalLineItem[] = d.__gutters ?? []
      const siding:  ProposalLineItem[] = d.__siding  ?? []
      delete d.__gutters; delete d.__siding; delete d.error
      const packages = d as Record<string, BrandPackage>

      setProposalPackages(packages)
      setGutterProposalItems(gutters)
      setSidingProposalItems(siding)

      const brands = Object.keys(packages)
      setActiveBrands(new Set(brands))

      const tradeLabel = [
        selectedTrades.includes('roofing') ? 'Roofing' : '',
        selectedTrades.includes('gutters') ? 'Gutters' : '',
        selectedTrades.includes('siding')  ? 'Siding'  : '',
      ].filter(Boolean).join(' + ')

      const names: Record<string, string> = {}
      const descs: Record<string, string> = {}
      brands.forEach(b => {
        names[b] = `${b} ${tradeLabel} Proposal`
        descs[b] = `Good / Better / Best ${tradeLabel.toLowerCase()} package for ${b} products`
      })
      setTemplateNames(names)
      setTemplateDescs(descs)
    }
    setPackageLoading(false)
  }

  // ── Phase C: Create templates ─────────────────────────────────────────────

  async function createTemplates() {
    setPhase('creating')
    const pkgList = Array.from(activeBrands)
      .filter(b => proposalPackages[b])
      .map(b => ({
        brand: b,
        templateName: templateNames[b] ?? `${b} Proposal`,
        templateDescription: templateDescs[b] ?? '',
        pkg: proposalPackages[b],
      }))

    const response = await fetch('/api/create-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl, apiKey,
        categoryUid:       preflight.categoryUid,
        statusUid:         preflight.statusUid,
        layoutTemplateUid: preflight.layoutUid,
        formulaMap,
        productIdMap,
        gutterItems: gutterProposalItems,
        sidingItems:  sidingProposalItems,
        packages: pkgList,
      }),
    })

    if (!response.body) return
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
        const ev = JSON.parse(line.slice(6))
        if (ev.type === 'complete') { setCreationDone(true); setPhase('done') }
        else setCreationLog(prev => [...prev, { brand: ev.brand, status: ev.status, msg: ev.message ?? ev.step }])
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const eligibleBrands = Object.keys(proposalPackages)
  const hasGutters = selectedTrades.includes('gutters') && gutterProposalItems.length > 0
  const hasSiding  = selectedTrades.includes('siding')  && sidingProposalItems.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">Proposal Templates</h2>
        <p className="text-gray-500 mt-2">
          Building Good / Better / Best CPQ templates for{' '}
          <span className="font-medium text-orange-500">{companyName}</span>
        </p>
      </div>

      {/* ── Pre-flight checks ── */}
      <div className="bg-white rounded-2xl border border-[#E5E2DC] divide-y divide-[#E5E2DC]">
        {([
          { key: 'category', label: 'Roof Inspection job category',        value: preflight.categoryName, uid: preflight.categoryUid, optional: false, hasOptions: categoryOptions.length > 0, emptyMsg: 'No job categories exist in this Zuper account' },
          { key: 'status',   label: '"Create Proposal" job status',        value: preflight.statusName,   uid: preflight.statusUid,   optional: false, hasOptions: statusOptions.length > 0,   emptyMsg: 'No statuses exist in this category' },
          { key: 'layout',   label: 'Residential Roofing Proposal layout', value: preflight.layoutName,   uid: preflight.layoutUid,   optional: true,  hasOptions: layoutOptions.length > 0,   emptyMsg: 'Optional — not found, templates will use account default' },
        ] as const).map(item => {
          const subText = item.uid ? item.value : preflightLoading ? 'Checking…' : item.hasOptions ? 'Not found — pick below' : item.emptyMsg
          return (
            <div key={item.key} className="flex items-center gap-4 px-5 py-4">
              {preflightLoading && !item.uid ? <Spinner />
                : item.uid
                ? <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                : item.optional
                ? <div className="w-6 h-6 rounded-full border-2 border-amber-300 flex items-center justify-center flex-shrink-0"><span className="text-amber-400 text-xs font-bold leading-none">—</span></div>
                : <div className="w-6 h-6 rounded-full border-2 border-red-400 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className={`text-xs ${item.optional && !item.uid && !preflightLoading ? 'text-amber-500' : !item.uid && !preflightLoading && !item.hasOptions ? 'text-red-400' : 'text-gray-400'}`}>{subText}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pickers */}
      {!preflight.categoryUid && categoryOptions.length > 0 && (
        <PickerModal title="Select the job category to trigger proposals from:" items={categoryOptions} onPick={(uid) => { setStatusOptions([]); runPreflight(uid) }} />
      )}
      {preflight.categoryUid && !preflight.statusUid && statusOptions.length > 0 && (
        <PickerModal title='Select the job status that should trigger "Create Proposal":' items={statusOptions} onPick={(uid, name) => setPreflight(p => ({ ...p, statusUid: uid, statusName: name }))} />
      )}
      {!preflight.layoutUid && layoutOptions.length > 0 && (
        <PickerModal title="Select the proposal layout template to use:" items={layoutOptions} onPick={(uid, name) => setPreflight(p => ({ ...p, layoutUid: uid, layoutName: name }))} />
      )}

      {/* ── Package preview ── */}
      {phase !== 'preflight' && (
        <>
          {packageLoading ? (
            <div className="flex items-center gap-3 text-gray-500 text-sm"><Spinner /> Loading packages…</div>
          ) : eligibleBrands.length === 0 ? (
            <p className="text-gray-500 text-sm">No eligible roofing brands found within selected product lines.</p>
          ) : (
            <>
              {/* Brand filter pills */}
              <div className="flex flex-wrap gap-2">
                {eligibleBrands.map(b => (
                  <button key={b} onClick={() => setActiveBrands(s => { const n = new Set(s); n.has(b) ? n.delete(b) : n.add(b); return n })}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${activeBrands.has(b) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-[#E5E2DC] hover:border-gray-400'}`}>
                    {b}
                  </button>
                ))}
              </div>

              {/* Package cards */}
              {eligibleBrands.filter(b => activeBrands.has(b)).map(brand => {
                const pkg = proposalPackages[brand]
                return (
                  <div key={brand} className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E5E2DC] space-y-3">
                      <p className="font-bold text-gray-900">{brand}</p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Template name</label>
                          <input value={templateNames[brand] ?? ''} onChange={e => setTemplateNames(n => ({ ...n, [brand]: e.target.value }))}
                            className="w-full mt-1 text-sm border border-[#E5E2DC] rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Description</label>
                          <input value={templateDescs[brand] ?? ''} onChange={e => setTemplateDescs(n => ({ ...n, [brand]: e.target.value }))}
                            className="w-full mt-1 text-sm border border-[#E5E2DC] rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400" />
                        </div>
                      </div>
                    </div>

                    {/* Roofing G/B/B tiers */}
                    <div className="p-4 grid grid-cols-3 gap-3">
                      {(['good', 'better', 'best'] as const).map(tier => (
                        <div key={tier} className={`rounded-xl border ${TIER_BORDER[tier]} p-3 space-y-1`}>
                          <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${TIER_HEADING[tier]}`}>{TIER_LABELS[tier]}</p>
                          {pkg[tier].map((item, i) => <LineItemRow key={i} item={item} />)}
                        </div>
                      ))}
                    </div>

                    {/* Gutter section preview */}
                    {hasGutters && (
                      <div className="px-4 pb-4">
                        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-sky-600 mb-2">Gutter Materials <span className="font-normal text-sky-400">(same in all tiers)</span></p>
                          <div className="space-y-1">
                            {gutterProposalItems.map((item, i) => <LineItemRow key={i} item={item} />)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Siding section preview */}
                    {hasSiding && (
                      <div className="px-4 pb-4">
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-violet-600 mb-2">Siding Materials <span className="font-normal text-violet-400">(same in all tiers)</span></p>
                          <div className="space-y-1">
                            {sidingProposalItems.map((item, i) => <LineItemRow key={i} item={item} />)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* ── Creation log ── */}
          {(phase === 'creating' || (phase === 'done' && creationLog.length > 0)) && (
            <div className="bg-[#1C1917] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                <span className="text-xs text-gray-500 font-mono">Creation log</span>
                <button
                  onClick={() => {
                    const text = creationLog.map(e => `${e.status === 'done' ? '✓' : e.status === 'error' ? '✗' : e.status === 'debug' ? '·' : '⟳'} ${e.status !== 'debug' ? `${e.brand} — ` : ''}${e.msg}`).join('\n')
                    navigator.clipboard.writeText(text)
                  }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 font-mono border border-white/10 rounded px-2 py-0.5 transition-colors">
                  Copy log
                </button>
              </div>
              <div className="p-4 space-y-0.5 font-mono text-xs overflow-y-auto max-h-96">
                {creationLog.map((entry, i) => (
                  <div key={i} className={entry.status === 'done' ? 'text-green-400' : entry.status === 'error' ? 'text-red-400' : entry.status === 'debug' ? 'text-gray-400' : 'text-orange-400'}>
                    {entry.status === 'done' ? '✓' : entry.status === 'error' ? '✗' : entry.status === 'debug' ? '·' : '⟳'}{' '}
                    {entry.status !== 'debug' && <>{entry.brand} — </>}{entry.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          {phase === 'preview' && allPreflightReady && eligibleBrands.length > 0 && activeBrands.size > 0 && (
            <button onClick={createTemplates} className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors">
              Create Templates in Zuper →
            </button>
          )}

          {phase === 'done' && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-700 font-semibold text-center">
                ✓ {creationLog.filter(e => e.status === 'done').length} templates created in Zuper
              </div>
              <button onClick={reset} className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors">
                Start New Import →
              </button>
            </div>
          )}
        </>
      )}

      <button onClick={() => setStep(8)} className="w-full text-sm text-gray-400 hover:text-gray-600 text-center transition-colors">
        ← Back to Done
      </button>
    </div>
  )
}
