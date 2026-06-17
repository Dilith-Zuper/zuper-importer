'use client'
import type { ReactNode } from 'react'

/** Shared top bar for the landing page and the remap flow. */
export function AppHeader({ subtitle, onHome, right }: {
  subtitle?: string
  onHome?: () => void
  right?: ReactNode
}) {
  return (
    <header className="bg-white border-b border-[#E5E2DC] h-16 flex items-center px-6">
      <div className="w-full max-w-[980px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/zuper-logo.svg" alt="Zuper" height={28} className="h-7 w-auto select-none" />
          <span className="text-[#E5E2DC] select-none">|</span>
          <span className="text-sm font-medium text-gray-500">SRS Product Importer</span>
          {subtitle && (
            <>
              <span className="text-[#E5E2DC] select-none">·</span>
              <span className="text-sm text-gray-400">{subtitle}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onHome && (
            <button
              onClick={onHome}
              className="text-xs font-medium text-gray-400 hover:text-orange-500 transition-colors"
            >
              ← Home
            </button>
          )}
          {right}
        </div>
      </div>
    </header>
  )
}
