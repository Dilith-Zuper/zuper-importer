'use client'
import { useEffect, useState } from 'react'

interface Props {
  reason: string
  onDismiss: () => void
}

export function NoToast({ reason, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    const t1 = setTimeout(() => setVisible(true), 10)
    // Auto-dismiss after 7s
    const t2 = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300) }, 7000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDismiss])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="bg-[#1C1917] text-white rounded-2xl shadow-2xl px-5 py-4 max-w-sm w-[calc(100vw-3rem)] flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">Your answer</p>
          <p className="text-sm text-gray-200 leading-relaxed">{reason}</p>
        </div>
        <button onClick={handleClose} className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors mt-0.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
