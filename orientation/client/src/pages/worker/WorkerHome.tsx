import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { getWorkerToken, setWorkerToken, workerApi } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import type { Status } from '@/lib/status'
import { ErrorNote, MojoMark, Spinner, StatusBadge } from '@/components/ui'

export default function WorkerHome() {
  const { lang, t } = useLang()
  const navigate = useNavigate()
  const [me, setMe] = useState<any>(null)
  const [error, setError] = useState<unknown>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!getWorkerToken()) return setMe(false)
    workerApi.get('/me').then(setMe).catch((e) => (e.status === 401 ? setMe(false) : setError(e)))
  }, [])

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md space-y-5 px-4 py-5">
      <MojoMark />
      <ErrorNote error={error} />
      {me === null && !error && <Spinner />}
      {me && (
        <>
          <h1 className="text-2xl font-bold">{t('myPasses')}</h1>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-white">
            {me.enrollments.map((e: any) => (
              <li key={e.id}>
                <Link to={`/pass/${e.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">{e.project_name}</span>
                    <StatusBadge status={e.effective_status as Status} lang={lang} />
                  </span>
                  <ChevronRight className="h-6 w-6 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
          <button
            className="text-sm text-gray-500 underline"
            onClick={() => {
              setWorkerToken(null)
              setMe(false)
            }}
          >
            {t('signOut')}
          </button>
        </>
      )}
      <form
        className="space-y-3 rounded-2xl border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(`/o/${code.trim().toUpperCase()}`)
        }}
      >
        <label className="w-label" htmlFor="code">
          {lang === 'es' ? 'Código del proyecto (del póster de la obra)' : 'Project code (from the site poster)'}
        </label>
        <input id="code" className="w-input font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} required />
        <button className="w-btn">{t('start')}</button>
      </form>
      <p className="text-center text-xs text-gray-400">
        <Link to="/staff">Staff sign in</Link>
      </p>
    </div>
  )
}
