import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Camera, CheckCircle2, ChevronRight, Circle, Globe, MapPin, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'
import { ApiError, getWorkerToken, setWorkerToken, workerApi } from '@/lib/api'
import { LANG_NAMES, storedLang, useLang, type Lang } from '@/lib/i18n'
import type { Status } from '@/lib/status'
import { ErrorNote, MojoMark, Spinner, StatusBadge } from '@/components/ui'
import { ModuleChat } from './ModuleChat'

interface ProjectInfo {
  project: { id: string; name: string; address: string | null; code: string }
  open: boolean
  languages: string[]
  companies: { id: string; name: string; type: string }[]
  trades: string[]
}

interface Me {
  id: string
  full_name: string
  phone: string
  preferred_language: Lang
  photo_url: string | null
  enrollments: { id: string; project_id: string; effective_status: Status }[]
}

interface PlanModule {
  module_id: string
  version_id: string
  layer: string
  title: string
  state: 'complete' | 'todo' | 'delta' | 'expired'
  superseded: boolean
  segment_count: number
  segment_index: number
}

interface Plan {
  enrollment: {
    id: string
    project_name: string
    status: Status
    expires_at: string | null
    attested_at: string | null
    credential_token: string
  }
  locked: null | { reason: 'not_ready' } | { reason: 'not_open_yet'; opens_at: string }
  has_photo: boolean
  worker_name: string
  ready_to_attest: boolean
  attestation_statement: string
  modules: PlanModule[]
}

type Step = 'loading' | 'lang' | 'phone' | 'code' | 'profile' | 'photo' | 'plan' | 'module' | 'attest'

/** Resize to ≤640px JPEG so uploads stay small on limited data plans. */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export default function WorkerFlow() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { lang, setLang, t } = useLang()
  const [step, setStep] = useState<Step>('loading')
  const [info, setInfo] = useState<ProjectInfo | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  // form state
  const [phone, setPhone] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [profile, setProfile] = useState({ full_name: '', company_id: '', employer_name: '', crew: '', trade: '', start_date: '' })
  const [otherEmployer, setOtherEmployer] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [signedName, setSignedName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const loadPlan = useCallback(
    async (eid: string) => {
      const p = await workerApi.get<Plan>(`/enrollments/${eid}/plan?lang=${lang}`)
      setPlan(p)
      return p
    },
    [lang]
  )

  /** Decide where a (possibly returning) worker should land — FR-6 resume. */
  const route = useCallback(
    async (projectId: string) => {
      const m = await workerApi.get<Me>('/me')
      setMe(m)
      const e = m.enrollments.find((x) => x.project_id === projectId)
      if (!e || !m.full_name) {
        setProfile((p) => ({ ...p, full_name: m.full_name || p.full_name }))
        setStep('profile')
        return
      }
      setEnrollmentId(e.id)
      await loadPlan(e.id)
      setStep(m.photo_url ? 'plan' : 'photo')
    },
    [loadPlan]
  )

  useEffect(() => {
    ;(async () => {
      try {
        const i = await workerApi.get<ProjectInfo>(`/projects/${encodeURIComponent(code)}`)
        setInfo(i)
        if (getWorkerToken()) {
          try {
            await route(i.project.id)
            return
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) setWorkerToken(null)
            else throw e
          }
        }
        setStep(storedLang() ? 'phone' : 'lang')
      } catch (e) {
        setError(e)
        setStep('lang')
      }
    })()
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload plan text when language changes (progress is language-independent).
  useEffect(() => {
    if (enrollmentId && (step === 'plan' || step === 'attest')) loadPlan(enrollmentId).catch(setError)
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
      <MojoMark className="text-base" />
      <button
        onClick={() => {
          const next = lang === 'en' ? 'es' : 'en'
          setLang(next)
          if (me) workerApi.patch('/me', { preferred_language: next }).catch(() => {})
        }}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-gray-300 bg-white px-3 text-sm font-semibold"
        aria-label="Change language / Cambiar idioma"
      >
        <Globe className="h-4 w-4" /> {lang === 'en' ? 'Español' : 'English'}
      </button>
    </header>
  )

  const projectCard = info && (
    <div className="rounded-2xl bg-mojo-dark px-5 py-4 text-white">
      <p className="text-sm uppercase tracking-wider text-gray-300">{t('siteOrientation')}</p>
      <p className="mt-0.5 text-xl font-bold">{info.project.name}</p>
      {info.project.address && (
        <p className="mt-1 flex items-center gap-1 text-sm text-gray-300">
          <MapPin className="h-4 w-4" /> {info.project.address}
        </p>
      )}
    </div>
  )

  if (step === 'module' && enrollmentId && activeModule) {
    return (
      <ModuleChat
        key={activeModule}
        enrollmentId={enrollmentId}
        versionId={activeModule}
        lang={lang}
        t={t}
        onExit={() => {
          setActiveModule(null)
          setStep('plan')
          loadPlan(enrollmentId).catch(setError)
        }}
        onDone={async () => {
          const p = await loadPlan(enrollmentId)
          const next = p.modules.find((m) => m.state !== 'complete')
          if (next) setActiveModule(next.version_id)
          else {
            setActiveModule(null)
            setStep(p.ready_to_attest ? 'attest' : 'plan')
          }
        }}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-[#F3F4F6]">
      {header}
      {!online && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
          <WifiOff className="h-4 w-4" /> {t('offline')}
        </div>
      )}
      <main className="flex-1 space-y-4 px-4 pb-8">
        {step === 'loading' && (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Spinner className="h-8 w-8 text-brand-500" />
          </div>
        )}

        {step !== 'loading' && projectCard}
        <ErrorNote error={error} />

        {step === 'lang' && info && (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">{t('chooseLanguage')}</h1>
            <p className="text-lg text-gray-700">{t('intro')}</p>
            {(info.languages as Lang[]).filter((l) => l in LANG_NAMES).map((l) => (
              <button
                key={l}
                className="w-btn-ghost"
                onClick={() => {
                  setLang(l)
                  setStep('phone')
                }}
              >
                {LANG_NAMES[l]}
              </button>
            ))}
          </section>
        )}

        {step === 'phone' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                const r = await workerApi.post<{ phone: string; dev_code?: string }>('/otp/start', { phone, lang })
                setMaskedPhone(r.phone)
                setDevCode(r.dev_code ?? null)
                setStep('code')
              })
            }}
          >
            <h1 className="text-2xl font-bold">{t('phoneTitle')}</h1>
            <p className="text-lg text-gray-700">{t('phoneHelp')}</p>
            <input
              className="w-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 555-0123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
            />
            <button className="w-btn" disabled={busy || phone.replace(/\D/g, '').length < 10}>
              {busy ? <Spinner /> : null} {t('sendCode')}
            </button>
          </form>
        )}

        {step === 'code' && info && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                const r = await workerApi.post<{ token: string }>('/otp/verify', { phone, code: otp })
                setWorkerToken(r.token)
                await route(info.project.id)
              })
            }}
          >
            <h1 className="text-2xl font-bold">{t('codeTitle')}</h1>
            <p className="text-lg text-gray-700">
              {t('codeHelp')} <strong>{maskedPhone}</strong>
            </p>
            {devCode && (
              <p className="rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
                {t('devCode')} <strong className="font-mono">{devCode}</strong>
              </p>
            )}
            <input
              className="w-input text-center font-mono text-2xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
            />
            <button className="w-btn" disabled={busy || otp.length !== 6}>
              {busy ? <Spinner /> : null} {t('verify')}
            </button>
            <button type="button" className="w-full py-2 text-base font-semibold text-brand-700" onClick={() => setStep('phone')}>
              {t('resend')}
            </button>
          </form>
        )}

        {step === 'profile' && info && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                const r = await workerApi.post<{ enrollment_id: string }>('/enroll', {
                  join_code: info.project.code,
                  full_name: profile.full_name,
                  company_id: otherEmployer ? null : profile.company_id || null,
                  employer_name: otherEmployer ? profile.employer_name : null,
                  crew: profile.crew || null,
                  trade: profile.trade || null,
                  start_date: profile.start_date || null,
                  language: lang,
                })
                setEnrollmentId(r.enrollment_id)
                await loadPlan(r.enrollment_id)
                const m = await workerApi.get<Me>('/me')
                setMe(m)
                setStep(m.photo_url ? 'plan' : 'photo')
              })
            }}
          >
            <h1 className="text-2xl font-bold">{t('aboutYou')}</h1>
            <div>
              <label className="w-label" htmlFor="fn">
                {t('fullName')}
              </label>
              <input
                id="fn"
                className="w-input"
                autoComplete="name"
                value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="w-label" htmlFor="emp">
                {t('employer')}
              </label>
              {!otherEmployer ? (
                <select
                  id="emp"
                  className="w-input"
                  value={profile.company_id}
                  onChange={(e) => {
                    if (e.target.value === '__other') {
                      setOtherEmployer(true)
                      setProfile({ ...profile, company_id: '' })
                    } else setProfile({ ...profile, company_id: e.target.value })
                  }}
                  required
                >
                  <option value="">{t('employerPick')}</option>
                  {info.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__other">{t('employerOther')}</option>
                </select>
              ) : (
                <input
                  id="emp"
                  className="w-input"
                  placeholder={t('employerName')}
                  value={profile.employer_name}
                  onChange={(e) => setProfile({ ...profile, employer_name: e.target.value })}
                  required
                />
              )}
            </div>
            <div>
              <label className="w-label" htmlFor="trade">
                {t('trade')}
              </label>
              <select id="trade" className="w-input" value={profile.trade} onChange={(e) => setProfile({ ...profile, trade: e.target.value })}>
                <option value="">{t('tradeGeneral')}</option>
                {info.trades.map((tr) => (
                  <option key={tr} value={tr}>
                    {tr}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="w-label" htmlFor="crew">
                {t('crew')}
              </label>
              <input id="crew" className="w-input" value={profile.crew} onChange={(e) => setProfile({ ...profile, crew: e.target.value })} />
            </div>
            <div>
              <label className="w-label" htmlFor="sd">
                {t('startDate')}
              </label>
              <input
                id="sd"
                type="date"
                className="w-input"
                value={profile.start_date}
                onChange={(e) => setProfile({ ...profile, start_date: e.target.value })}
              />
            </div>
            <button className="w-btn" disabled={busy}>
              {busy ? <Spinner /> : null} {t('continue')}
            </button>
          </form>
        )}

        {step === 'photo' && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold">{t('photoTitle')}</h1>
            <p className="text-lg text-gray-700">{t('photoHelp')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setPhoto(await compressImage(f))
                e.target.value = ''
              }}
            />
            {photo ? (
              <>
                <img src={photo} alt="" className="mx-auto aspect-square w-64 rounded-2xl border-4 border-white object-cover shadow" />
                <button
                  className="w-btn"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await workerApi.post('/photo', { image: photo })
                      setMe(await workerApi.get<Me>('/me'))
                      await loadPlan(enrollmentId!)
                      setStep('plan')
                    })
                  }
                >
                  {busy ? <Spinner /> : null} {t('usePhoto')}
                </button>
                <button className="w-btn-ghost" onClick={() => fileRef.current?.click()}>
                  <RefreshCw className="h-5 w-5" /> {t('retake')}
                </button>
              </>
            ) : (
              <button className="w-btn" onClick={() => fileRef.current?.click()}>
                <Camera className="h-6 w-6" /> {t('takePhoto')}
              </button>
            )}
          </section>
        )}

        {step === 'plan' && plan && <PlanView plan={plan} lang={lang} t={t} onOpen={(v) => { setActiveModule(v); setStep('module') }} onSign={() => setStep('attest')} onPass={() => navigate(`/pass/${plan.enrollment.id}`)} onPhoto={() => setStep('photo')} />}

        {step === 'attest' && plan && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                const p = await workerApi.post<Plan>(`/enrollments/${plan.enrollment.id}/attest`, { signed_name: signedName, language: lang })
                setPlan(p)
                navigate(`/pass/${plan.enrollment.id}`)
              })
            }}
          >
            <h1 className="text-2xl font-bold">{t('signTitle')}</h1>
            <p className="rounded-2xl border-2 border-gray-300 bg-white p-4 text-lg leading-relaxed">{plan.attestation_statement}</p>
            {!plan.has_photo && (
              <button type="button" className="w-btn-ghost" onClick={() => setStep('photo')}>
                <Camera className="h-5 w-5" /> {t('needPhoto')}
              </button>
            )}
            <div>
              <label className="w-label" htmlFor="sig">
                {t('typeName')}
              </label>
              <input id="sig" className="w-input font-serif italic" value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder={plan.worker_name} required minLength={2} />
            </div>
            <button className="w-btn" disabled={busy || !plan.has_photo || signedName.trim().length < 2}>
              {busy ? <Spinner /> : null} {t('sign')}
            </button>
            <button type="button" className="w-full py-2 text-base font-semibold text-brand-700" onClick={() => setStep('plan')}>
              {t('back')}
            </button>
          </form>
        )}
      </main>
      <footer className="px-4 pb-6 text-center text-sm text-gray-500">
        <Link to="/me" className="underline">
          {t('myPasses')}
        </Link>
      </footer>
    </div>
  )
}

function PlanView({
  plan,
  lang,
  t,
  onOpen,
  onSign,
  onPass,
  onPhoto,
}: {
  plan: Plan
  lang: Lang
  t: (k: any) => string
  onOpen: (versionId: string) => void
  onSign: () => void
  onPass: () => void
  onPhoto: () => void
}) {
  const s = plan.enrollment.status
  if (plan.locked) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-lg text-amber-950">
        {plan.locked.reason === 'not_ready' ? t('notReady') : `${t('notOpenYet')} ${new Date(plan.locked.opens_at).toLocaleDateString(lang)}`}
      </div>
    )
  }
  const done = plan.modules.filter((m) => m.state === 'complete').length
  const next = plan.modules.find((m) => m.state !== 'complete')
  const blocked = s === 'revoked' || s === 'suspended'

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('yourOrientation')}</h1>
        <StatusBadge status={s} lang={lang} />
      </div>

      {blocked && (
        <div className="flex gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-lg text-red-900">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" /> {t('revoked')}
        </div>
      )}
      {s === 'refresh_required' && <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 text-lg text-orange-950">{t('refreshNeeded')}</div>}

      <div>
        <div className="mb-1 flex justify-between text-base font-medium text-gray-700">
          <span>
            {done} / {plan.modules.length} {t('modulesDone')}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(done / Math.max(plan.modules.length, 1)) * 100}%` }} />
        </div>
      </div>

      {(s === 'cleared' || s === 'pending_verification') && (
        <button className="w-btn bg-green-600 active:bg-green-700" onClick={onPass}>
          <CheckCircle2 className="h-6 w-6" /> {t('credential')}
        </button>
      )}
      {!blocked && next && (
        <button className="w-btn" onClick={() => onOpen(next.version_id)}>
          {done === 0 && next.segment_index === 0 ? t('start') : t('continue')} <ChevronRight className="h-6 w-6" />
        </button>
      )}
      {!blocked && plan.ready_to_attest && (
        <button className="w-btn" onClick={plan.has_photo ? onSign : onPhoto}>
          {plan.has_photo ? t('sign') : t('needPhoto')}
        </button>
      )}

      <ol className="divide-y overflow-hidden rounded-2xl border bg-white">
        {plan.modules.map((m, i) => (
          <li key={m.module_id}>
            <button
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
              onClick={() => onOpen(m.version_id)}
              disabled={blocked || m.state === 'complete'}
            >
              {m.state === 'complete' ? (
                <CheckCircle2 className="h-7 w-7 shrink-0 text-green-600" />
              ) : (
                <Circle className={clsx('h-7 w-7 shrink-0', m.state === 'todo' ? 'text-gray-300' : 'text-orange-500')} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-gray-500">
                  {t('part')} {i + 1}
                </span>
                <span className="block text-lg font-semibold leading-snug">{m.title}</span>
                {m.state === 'delta' || (m.state === 'todo' && m.superseded) ? (
                  <span className="block text-sm font-medium text-orange-700">{t('updated')}</span>
                ) : m.state === 'expired' ? (
                  <span className="block text-sm font-medium text-red-700">{t('expiredModule')}</span>
                ) : null}
              </span>
              {m.state !== 'complete' && !blocked && <ChevronRight className="h-6 w-6 text-gray-400" />}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
