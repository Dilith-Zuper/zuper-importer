'use client'
import { useState, useRef } from 'react'
import { useWizardStore } from '@/store/wizard-store'
import { ProgressBar } from '@/components/ui/ProgressBar'

type Phase = 'preview' | 'creating' | 'done' | 'error'

export function Step9Vendor() {
  const {
    baseUrl, apiKey, companyName,
    productIdMap, colorCatalogMap,
    setStep,
  } = useWizardStore()

  const [phase, setPhase]           = useState<Phase>('preview')
  const [statusMsg, setStatusMsg]   = useState('')
  const [catalogEntries, setCatalogEntries] = useState(0)
  const [vendorUid, setVendorUid]   = useState('')
  const [errorMsg, setErrorMsg]     = useState('')
  const startedRef = useRef(false)

  // Count expected entries
  const totalProducts = Object.keys(productIdMap).length
  const totalEntries  = Object.values(colorCatalogMap).reduce((s, arr) => s + arr.length, 0)
    + Object.keys(productIdMap).filter(id => !colorCatalogMap[id]).length

  async function startCreation() {
    if (startedRef.current) return
    startedRef.current = true
    setPhase('creating')

    try {
      const response = await fetch('/api/create-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, productIdMap, colorCatalogMap }),
      })

      if (!response.ok || !response.body) {
        setPhase('error')
        setErrorMsg('Failed to connect to vendor creation API')
        return
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))

          if (data.type === 'status') setStatusMsg(data.message ?? '')
          if (data.type === 'done') {
            setVendorUid(data.vendorUid ?? '')
            setCatalogEntries(data.catalogEntries ?? 0)
            setPhase('done')
          }
          if (data.type === 'error') {
            setErrorMsg(data.message ?? 'Unknown error')
            setPhase('error')
          }
        }
      }
    } catch (e: unknown) {
      setPhase('error')
      setErrorMsg((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-extrabold text-[#1A1A1A] leading-tight">
          {phase === 'done' ? 'Vendor catalog created' : 'Create Vendor Catalog'}
        </h2>
        <p className="text-gray-500 mt-1">
          SRS Distribution Inc → <span className="font-medium text-orange-500">{companyName}</span>
        </p>
      </div>

      {/* Vendor preview card */}
      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Vendor Details</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 font-medium">Name</p>
            <p className="font-semibold text-gray-800">SRS Distribution Inc</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Phone</p>
            <p className="font-semibold text-gray-800">214-491-4149</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Billing Address</p>
            <p className="font-semibold text-gray-800">7440 State Hwy 121, McKinney TX 75070</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Payment Term</p>
            <p className="font-semibold text-gray-800">Immediate</p>
          </div>
        </div>
      </div>

      {/* Catalog summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 text-center">
          <p className="text-3xl font-bold text-orange-500">{totalProducts.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Products</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E2DC] p-4 text-center">
          <p className="text-3xl font-bold text-orange-500">{totalEntries.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Catalog entries (incl. per-color SKUs)</p>
        </div>
      </div>

      {/* Creating state */}
      {phase === 'creating' && (
        <div className="bg-white rounded-2xl border border-[#E5E2DC] p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin flex-shrink-0" />
            <p className="text-sm text-gray-600">{statusMsg || 'Creating vendor…'}</p>
          </div>
          <ProgressBar value={phase === 'creating' ? 50 : 100} max={100} label="Creating…" />
        </div>
      )}

      {/* Done state */}
      {phase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-700 font-semibold text-center">
          Vendor created — {catalogEntries.toLocaleString()} catalog entries uploaded
          {vendorUid && <span className="block text-xs font-normal text-green-600 mt-1">Vendor UID: {vendorUid}</span>}
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          <p className="font-semibold">Vendor creation failed</p>
          <p className="mt-1 text-xs">{errorMsg}</p>
        </div>
      )}

      {/* Actions */}
      {phase === 'preview' && (
        <button
          onClick={startCreation}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
        >
          Create Vendor &amp; Upload Catalog →
        </button>
      )}

      {phase === 'done' && (
        <button
          onClick={() => setStep(10)}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
        >
          Build Proposal Templates →
        </button>
      )}

      {(phase === 'done' || phase === 'error') && (
        <button
          onClick={() => setStep(10)}
          className="w-full h-11 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-sm"
        >
          Skip to Proposal Templates →
        </button>
      )}

      <button onClick={() => setStep(8)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
        ← Back
      </button>
    </div>
  )
}
