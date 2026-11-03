import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeft, Check, Volume2, VolumeX, X } from 'lucide-react'
import { mediaUrl, workerApi } from '@/lib/api'
import { flushProgress, queueProgress } from '@/lib/offline'
import { speak, stopSpeaking, ttsSupported } from '@/lib/tts'
import type { Lang, StringKey } from '@/lib/i18n'
import { ErrorNote, Spinner } from '@/components/ui'

interface ModuleData {
  module_id: string
  version_id: string
  title: string
  mode: 'full' | 'delta'
  segment_index: number
  segments: { id: string; text: string; image_url: string | null }[]
  checks: { id: string; prompt: string; options: string[] }[]
  passed_checks: string[]
}

type Bubble =
  | { kind: 'segment'; key: string; text: string; image: string | null }
  | { kind: 'question'; key: string; text: string }
  | { kind: 'answer'; key: string; text: string; correct: boolean }
  | { kind: 'reteach'; key: string; text: string }

const AUTO_KEY = 'orient_autoread'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Conversational delivery (FR-3): content arrives as short chat messages with
 * read-aloud, then comprehension checks (FR-4). A wrong answer gets a re-teach
 * in different words and the question again with options reshuffled — the
 * answer is never revealed.
 */
export function ModuleChat({
  enrollmentId,
  versionId,
  lang,
  t,
  onExit,
  onDone,
}: {
  enrollmentId: string
  versionId: string
  lang: Lang
  t: (k: StringKey) => string
  onExit: () => void
  onDone: () => void
}) {
  const [data, setData] = useState<ModuleData | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [seen, setSeen] = useState<number | null>(null) // segments shown
  const [passed, setPassed] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Bubble[]>([]) // check Q&A bubbles
  const [phase, setPhase] = useState<'ask' | 'reteach'>('ask')
  const [order, setOrder] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) === '1'
    } catch {
      return false
    }
  })
  const [speakingKey, setSpeakingKey] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  // (Re)load in the current language. Switching language keeps the position (FR-3).
  useEffect(() => {
    let alive = true
    setError(null)
    workerApi
      .get<ModuleData>(`/enrollments/${enrollmentId}/modules/${versionId}?lang=${lang}`)
      .then((d) => {
        if (!alive) return
        setData(d)
        setSeen((s) => s ?? Math.max(1, Math.min(d.segment_index, d.segments.length)))
        setPassed((p) => (p.size ? p : new Set(d.passed_checks)))
      })
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
      stopSpeaking()
    }
  }, [enrollmentId, versionId, lang])

  useEffect(() => {
    if (data && seen !== null) {
      queueProgress({ enrollment_id: enrollmentId, module_version_id: versionId, segment_index: seen, language: lang })
    }
  }, [seen, data, enrollmentId, versionId, lang])

  const currentCheck = useMemo(() => {
    if (!data || seen === null || seen < data.segments.length) return null
    return data.checks.find((c) => !passed.has(c.id)) ?? null
  }, [data, seen, passed])

  useEffect(() => {
    if (currentCheck) setOrder(shuffle(currentCheck.options.map((_, i) => i)))
  }, [currentCheck?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [seen, history.length, phase, currentCheck?.id])

  const say = (key: string, text: string) => {
    if (speakingKey === key) {
      stopSpeaking()
      setSpeakingKey(null)
      return
    }
    setSpeakingKey(key)
    speak(text, lang, () => setSpeakingKey((k) => (k === key ? null : k)))
  }

  // Auto-read the newest segment / question.
  useEffect(() => {
    if (!auto || !data || seen === null) return
    if (currentCheck) say(`q-${currentCheck.id}-${phase}`, phase === 'ask' ? currentCheck.prompt : '')
    else {
      const s = data.segments[seen - 1]
      if (s) say(`s-${s.id}`, s.text)
    }
  }, [seen, currentCheck?.id, auto]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="space-y-4 p-4">
        <ErrorNote error={error} />
        <button className="w-btn-ghost" onClick={onExit}>
          {t('back')}
        </button>
      </div>
    )
  }
  if (!data || seen === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    )
  }

  const segmentsDone = seen >= data.segments.length
  const allPassed = segmentsDone && data.checks.every((c) => passed.has(c.id))
  const total = data.segments.length + data.checks.length
  const progress = Math.min(seen, data.segments.length) + data.checks.filter((c) => passed.has(c.id)).length

  const answer = async (originalIndex: number) => {
    if (!currentCheck || busy) return
    setBusy(true)
    stopSpeaking()
    try {
      const r = await workerApi.post<{ correct: boolean; reteach: string | null }>(`/enrollments/${enrollmentId}/checks`, {
        module_version_id: versionId,
        check_id: currentCheck.id,
        selected_index: originalIndex,
        language: lang,
      })
      const q: Bubble = { kind: 'question', key: `q-${currentCheck.id}-${history.length}`, text: currentCheck.prompt }
      const a: Bubble = { kind: 'answer', key: `a-${history.length}`, text: currentCheck.options[originalIndex], correct: r.correct }
      if (r.correct) {
        setHistory((h) => [...h, q, a])
        setPassed((p) => new Set(p).add(currentCheck.id))
        setPhase('ask')
      } else {
        const re: Bubble = { kind: 'reteach', key: `r-${history.length}`, text: r.reteach ?? '' }
        setHistory((h) => [...h, q, a, re])
        setPhase('reteach')
        if (auto && r.reteach) say(re.key, r.reteach)
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    setBusy(true)
    try {
      await flushProgress()
      await workerApi.post(`/enrollments/${enrollmentId}/modules/${versionId}/complete`, { language: lang })
      stopSpeaking()
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  const SpeakBtn = ({ k, text }: { k: string; text: string }) =>
    ttsSupported() && text ? (
      <button
        type="button"
        onClick={() => say(k, text)}
        className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/80 px-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200"
        aria-label={speakingKey === k ? t('stop') : t('listen')}
      >
        {speakingKey === k ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {speakingKey === k ? t('stop') : t('listen')}
      </button>
    ) : null

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="grid h-11 w-11 place-items-center rounded-full hover:bg-gray-100" aria-label={t('back')}>
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{data.title}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(progress / Math.max(total, 1)) * 100}%` }} />
            </div>
          </div>
        </div>
        {ttsSupported() && (
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked)
                try {
                  localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0')
                } catch {
                  /* ignore */
                }
                if (!e.target.checked) stopSpeaking()
              }}
            />
            {t('autoRead')}
          </label>
        )}
      </header>

      <div className="flex-1 space-y-3 px-4 py-4" aria-live="polite">
        {data.segments.slice(0, seen).map((s) => (
          <div key={s.id} className="max-w-[92%] rounded-2xl rounded-tl-sm bg-brand-50 px-4 py-3 text-lg leading-relaxed text-gray-900">
            {s.image_url && <img src={mediaUrl(s.image_url)!} alt="" className="mb-2 w-full rounded-lg border" />}
            <p>{s.text}</p>
            <SpeakBtn k={`s-${s.id}`} text={s.text} />
          </div>
        ))}

        {history.map((b) =>
          b.kind === 'question' ? (
            <div key={b.key} className="max-w-[92%] rounded-2xl rounded-tl-sm bg-brand-50 px-4 py-3 text-lg font-semibold">
              {b.text}
            </div>
          ) : b.kind === 'answer' ? (
            <div key={b.key} className="ml-auto flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-gray-800 px-4 py-3 text-lg text-white">
              {b.correct ? <Check className="mt-1 h-5 w-5 shrink-0 text-green-400" /> : <X className="mt-1 h-5 w-5 shrink-0 text-red-300" />}
              <span>{b.text}</span>
            </div>
          ) : b.kind === 'reteach' ? (
            <div key={b.key} className="max-w-[92%] rounded-2xl rounded-tl-sm border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg">
              <p className="mb-1 font-semibold text-amber-900">{t('notQuite')}</p>
              <p>{b.text}</p>
              <SpeakBtn k={b.key} text={b.text} />
            </div>
          ) : null
        )}

        {currentCheck && phase === 'ask' && (
          <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-brand-50 px-4 py-3 text-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{t('quickCheck')}</p>
            <p className="mt-1 font-semibold">{currentCheck.prompt}</p>
            <SpeakBtn k={`q-${currentCheck.id}-ask`} text={[currentCheck.prompt, ...order.map((i) => currentCheck.options[i])].join('. ')} />
          </div>
        )}
        {allPassed && history.length > 0 && <p className="text-center text-lg font-semibold text-green-700">{t('correct')}</p>}
        <div ref={bottom} />
      </div>

      <footer className="sticky bottom-0 space-y-2 border-t bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {!segmentsDone && (
          <button className="w-btn" onClick={() => setSeen((s) => Math.min((s ?? 0) + 1, data.segments.length))}>
            {t('next')}
          </button>
        )}
        {currentCheck && phase === 'ask' && (
          <div className="grid gap-2">
            {order.map((i) => (
              <button key={i} disabled={busy} className={clsx('w-btn-ghost justify-start text-left')} onClick={() => answer(i)}>
                {currentCheck.options[i]}
              </button>
            ))}
          </div>
        )}
        {currentCheck && phase === 'reteach' && (
          <button
            className="w-btn"
            onClick={() => {
              setOrder(shuffle(currentCheck.options.map((_, i) => i)))
              setPhase('ask')
            }}
          >
            {t('tryAgain')}
          </button>
        )}
        {allPassed && (
          <button className="w-btn bg-green-600 active:bg-green-700" disabled={busy} onClick={finish}>
            {busy ? <Spinner /> : <Check className="h-6 w-6" />} {t('finishModule')}
          </button>
        )}
      </footer>
    </div>
  )
}
