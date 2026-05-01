'use client'
import { useState } from 'react'
import { useWizardStore } from '@/store/wizard-store'

export function Step1Connect() {
  const { setConnection } = useWizardStore()
  const [loginName, setLoginName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyLoginName: loginName, apiKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Connection failed')
      setConnection(loginName, apiKey, data.baseUrl, data.companyName)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-10">
        <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">Connect to Zuper</h1>
        <p className="text-base text-gray-500 mt-2">Enter your company login name and API key to get started</p>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-[#E5E2DC] px-5 py-4 space-y-1 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Login Name</label>
          <input
            type="text"
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="e.g. johnson-roofing"
            className="w-full text-[#1A1A1A] text-base placeholder-gray-300 focus:outline-none bg-transparent"
          />
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E2DC] px-5 py-4 space-y-1 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="eyJ…"
            className="w-full text-[#1A1A1A] text-base placeholder-gray-300 focus:outline-none bg-transparent"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 px-1">{error}</p>
        )}

        <button
          onClick={handleConnect}
          disabled={loading || !loginName.trim() || !apiKey.trim()}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2 text-base"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Connecting…
            </>
          ) : 'Connect →'}
        </button>
      </div>
    </div>
  )
}
