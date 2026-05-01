'use client'

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full space-y-2">
      <div className="h-3 bg-[#E5E2DC] rounded-full overflow-hidden">
        <div
          className="h-full bg-orange-500 transition-all duration-500 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{label ?? `${value.toLocaleString()} / ${max.toLocaleString()} products`}</span>
        <span className="font-semibold text-orange-500">{pct}%</span>
      </div>
    </div>
  )
}
