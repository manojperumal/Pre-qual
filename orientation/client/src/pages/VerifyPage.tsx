import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, XCircle } from 'lucide-react'
import { verifyCredential } from '@/lib/api'
import { fmtDate, fmtDateTime, type Status } from '@/lib/status'
import { ErrorNote, MojoMark, Spinner, StatusBadge } from '@/components/ui'
import { GateCard, type Card } from '@/components/GateCard'

type Result = (Card & { full: true }) | { full: false; display_name: string; project_name: string; company_name: string | null; trade: string | null; effective_status: Status; expires_at: string | null; checked_at: string }

/** What any phone camera opens when it scans a site pass (FR-14). */
export default function VerifyPage() {
  const { token = '' } = useParams()
  const [r, setR] = useState<Result | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    verifyCredential<Result>(token).then(setR).catch(setError)
  }, [token])

  if (error) return <div className="mx-auto max-w-md p-6"><ErrorNote error={error} /></div>
  if (!r) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>

  if (r.full) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <MojoMark />
        <GateCard card={r} canRevoke onChange={(c) => setR({ ...r, ...c })} />
        <Link className="text-sm text-brand-700" to={`/staff/workers/${r.id}`}>Full worker record →</Link>
      </div>
    )
  }
  const ok = r.effective_status === 'cleared'
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-4 p-6 text-center">
      <MojoMark />
      <div className={`flex w-full flex-col items-center gap-2 rounded-2xl p-6 text-white ${ok ? 'bg-green-600' : 'bg-red-600'}`}>
        {ok ? <ShieldCheck className="h-14 w-14" /> : <XCircle className="h-14 w-14" />}
        <p className="text-2xl font-extrabold">{ok ? 'CLEARED' : 'NOT CLEARED'}</p>
      </div>
      <p className="text-xl font-bold">{r.display_name}</p>
      <p className="text-gray-700">{r.company_name}{r.trade ? ` · ${r.trade}` : ''}</p>
      <p className="text-gray-700">{r.project_name}</p>
      <StatusBadge status={r.effective_status} size="lg" />
      {r.expires_at && <p className="text-sm text-gray-600">Expires {fmtDate(r.expires_at)}</p>}
      <p className="text-xs text-gray-400">Live status checked {fmtDateTime(r.checked_at)}</p>
      <Link to={`/staff/login?next=/v/${token}`} className="text-sm text-brand-700 underline">Site staff: sign in for photo check</Link>
    </div>
  )
}
