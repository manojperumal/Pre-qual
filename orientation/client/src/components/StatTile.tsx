import clsx from 'clsx'

export function StatTile({ label, value, tone = 'default', onClick, active }: { label: string; value: number; tone?: 'default' | 'good' | 'warn' | 'bad'; onClick?: () => void; active?: boolean }) {
  const toneCls = {
    default: 'text-gray-900',
    good: 'text-green-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx('card px-4 py-3 text-left transition', onClick && 'hover:border-brand-300', active && 'ring-2 ring-brand-500')}
    >
      <p className={clsx('text-2xl font-bold tabular-nums', toneCls)}>{value}</p>
      <p className="text-xs font-medium text-gray-600">{label}</p>
    </button>
  )
}
