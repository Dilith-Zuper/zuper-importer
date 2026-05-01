'use client'
import { useWizardStore } from '@/store/wizard-store'

export function Step6Done() {
  const { companyName, uploadSummary, reset } = useWizardStore()
  const { uploaded, skipped, errors } = uploadSummary

  function downloadErrors() {
    const csv = ['Product Name,Error', ...errors.map(e => `"${e.productName.replace(/"/g, '""')}","${e.message.replace(/"/g, '""')}"`)]
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'upload-errors.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-md mx-auto text-center space-y-8">
      {/* Animated checkmark */}
      <div className="flex flex-col items-center gap-4">
        <div className="animate-scale-in w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-200">
          <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
            <path d="M2 14l10 10L34 2" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h2 className="text-[40px] font-extrabold text-[#1A1A1A] leading-tight">Import Complete</h2>
          <p className="text-orange-500 font-semibold text-lg mt-1">{companyName}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border-t-4 border-green-400 border border-[#E5E2DC] p-4">
          <p className="text-3xl font-bold text-green-600">{uploaded.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Uploaded</p>
        </div>
        <div className="bg-white rounded-2xl border-t-4 border-gray-300 border border-[#E5E2DC] p-4">
          <p className="text-3xl font-bold text-gray-400">{skipped.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Skipped</p>
        </div>
        <div className="bg-white rounded-2xl border-t-4 border-red-400 border border-[#E5E2DC] p-4">
          <p className="text-3xl font-bold text-red-500">{errors.length.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Errors</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-left space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-red-700">Failed Products</p>
            <button onClick={downloadErrors} className="text-xs text-red-600 border border-red-300 rounded-full px-3 py-1 hover:bg-red-100 transition-colors font-medium">
              Download CSV
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {errors.map((e, i) => (
              <div key={i} className="text-xs text-red-600">
                <span className="font-semibold">{e.productName}</span>: {e.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={reset}
        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
      >
        Start New Import →
      </button>
    </div>
  )
}
