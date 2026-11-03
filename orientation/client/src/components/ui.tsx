import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { STATUS_LABEL, STATUS_STYLE, type Status } from '@/lib/status'

export function StatusBadge({ status, lang = 'en', size = 'sm' }: { status: Status; lang?: 'en' | 'es'; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-semibold whitespace-nowrap',
        size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-2 py-0.5 text-xs',
        STATUS_STYLE[status] ?? STATUS_STYLE.not_started
      )}
    >
      {STATUS_LABEL[status]?.[lang] ?? status}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className ?? 'h-5 w-5')} aria-hidden />
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-gray-500">
      <Spinner className="h-7 w-7" />
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  const details = (error as any)?.details
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {msg}
      {Array.isArray(details) && details.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {details.slice(0, 12).map((d: any, i: number) => (
            <li key={i}>{typeof d === 'string' ? d : d.title ?? JSON.stringify(d)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MojoMark({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <span className="grid h-7 w-7 place-items-center rounded-md bg-mojo-pink text-sm text-white">M</span>
      <span>
        Safety <span className="text-mojo-pink">Mojo</span>
      </span>
    </span>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-gray-900">{title}</p>
      {children && <div className="mt-1 text-sm text-gray-600">{children}</div>}
    </div>
  )
}
