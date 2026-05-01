'use client'

type Status = 'pending' | 'running' | 'pass' | 'fail'

export function ChecklistItem({ label, status, detail }: { label: string; status: Status; detail?: string }) {
  const icon = {
    pending: (
      <div className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center flex-shrink-0" />
    ),
    running: (
      <div className="w-9 h-9 rounded-full border-2 border-orange-500 border-t-transparent animate-spin flex-shrink-0" />
    ),
    pass: (
      <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
          <path d="M1 5.5l4 4 8-9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    ),
    fail: (
      <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    ),
  }[status]

  return (
    <div className={[
      'flex items-center gap-4 bg-white rounded-xl border px-5 py-4 transition-all',
      status === 'running' ? 'border-l-[3px] border-l-orange-400 border-[#E5E2DC]' : 'border-[#E5E2DC]',
    ].join(' ')}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{label}</p>
        {detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{detail}</p>}
      </div>
      <div className="flex-shrink-0">
        {status === 'pass' && (
          <span className="bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">✓ Ready</span>
        )}
        {status === 'fail' && (
          <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">Failed</span>
        )}
        {status === 'running' && (
          <span className="bg-orange-50 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-full">Running…</span>
        )}
      </div>
    </div>
  )
}
