import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { ShieldAlert } from 'lucide-react'
import { mediaUrl, workerApi } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import type { Status } from '@/lib/status'
import { ErrorNote, MojoMark, Spinner, StatusBadge } from '@/components/ui'

interface PlanLite {
  enrollment: { id: string; project_name: string; status: Status; expires_at: string | null; credential_token: string; revoke_category: string | null }
  worker_name: string
}

/** Digital site pass (FR-14). The QR resolves to live status wherever it is scanned. */
export default function Pass() {
  const { id = '' } = useParams()
  const { lang, t } = useLang()
  const [plan, setPlan] = useState<PlanLite | null>(null)
  const [me, setMe] = useState<{ photo_url: string | null; enrollments: { id: string; trade: string | null; employer: string | null; join_code: string }[] } | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.all([workerApi.get<PlanLite>(`/enrollments/${id}/plan?lang=${lang}`), workerApi.get<any>('/me')])
        .then(([p, m]) => {
          if (!alive) return
          setPlan(p)
          setMe(m)
          setError(null)
        })
        .catch((e) => alive && setError(e))
    load()
    const timer = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id, lang])

  if (!plan) {
    return <div className="flex min-h-[100dvh] items-center justify-center">{error ? <ErrorNote error={error} /> : <Spinner className="h-8 w-8" />}</div>
  }
  const e = plan.enrollment
  const mine = me?.enrollments.find((x) => x.id === id)
  const ok = e.status === 'cleared'
  const url = `${window.location.origin}/v/${e.credential_token}`

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center bg-white px-6 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <MojoMark />
      <p className="mt-4 text-sm uppercase tracking-wider text-gray-500">{t('credential')}</p>
      <h1 className="text-center text-xl font-bold">{e.project_name}</h1>
      <div className={`mt-4 w-full rounded-3xl border-[6px] p-5 ${ok ? 'border-green-500' : e.status === 'pending_verification' ? 'border-amber-400' : 'border-red-500'}`}>
        <div className="flex items-center gap-4">
          {me?.photo_url && <img src={mediaUrl(me.photo_url)!} alt="" className="h-20 w-20 rounded-xl object-cover" />}
          <div className="min-w-0">
            <p className="truncate text-xl font-bold">{plan.worker_name}</p>
            {mine?.employer && <p className="truncate text-gray-600">{mine.employer}</p>}
            {mine?.trade && <p className="truncate text-gray-600">{mine.trade}</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-center">
          <StatusBadge status={e.status} lang={lang} size="lg" />
        </div>
        <div className="mx-auto mt-5 w-full max-w-[260px] bg-white p-2">
          <QRCode value={url} style={{ width: '100%', height: 'auto' }} level="M" />
        </div>
        {e.expires_at && (
          <p className="mt-3 text-center text-base text-gray-700">
            {t('expires')}: <strong>{new Date(e.expires_at).toLocaleDateString(lang)}</strong>
          </p>
        )}
      </div>
      {e.status === 'pending_verification' && <p className="mt-4 text-center text-lg text-amber-900">{t('pendingGate')}</p>}
      {(e.status === 'revoked' || e.status === 'suspended') && (
        <p className="mt-4 flex gap-2 text-lg text-red-800">
          <ShieldAlert className="h-6 w-6 shrink-0" />
          {t('revoked')}
        </p>
      )}
      {['expired', 'refresh_required', 'in_progress', 'not_started'].includes(e.status) && mine && (
        <Link to={`/o/${mine.join_code}`} className="w-btn mt-4">
          {t('continue')}
        </Link>
      )}
      <p className="mt-4 text-center text-sm text-gray-500">{t('showAtGate')}</p>
      <Link to="/me" className="mt-4 text-sm text-gray-500 underline">
        {t('myPasses')}
      </Link>
    </div>
  )
}
