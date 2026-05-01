'use client'

interface Props {
  name: string
  count: number
  selected: boolean
  locked?: boolean
  onClick?: () => void
}

export function BrandTile({ name, count, selected, locked, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={[
        'relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all w-full',
        locked
          ? 'border-t-[3px] border-orange-500 bg-white cursor-default'
          : selected
          ? 'border-orange-500 bg-orange-50 hover:bg-orange-50'
          : 'border-[#E5E2DC] bg-white hover:border-gray-400',
      ].join(' ')}
    >
      {(locked || selected) && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}
      <span className="font-semibold text-gray-900 text-sm pr-6">{name}</span>
      <span className="text-xs text-gray-400 mt-0.5">{count.toLocaleString()} products</span>
      {locked && <span className="text-xs text-orange-500 mt-1 font-medium">Always included</span>}
    </button>
  )
}
