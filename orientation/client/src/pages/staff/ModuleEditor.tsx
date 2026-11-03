import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowLeft, ImagePlus, Lock, Plus, Trash2 } from 'lucide-react'
import { mediaUrl, staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fmtDateTime } from '@/lib/status'
import { ErrorNote, PageLoader } from '@/components/ui'
import { useStaff } from '@/components/StaffLayout'

type L10n = Record<string, string>
interface Segment { id: string; text: L10n; image_path?: string | null; image_url?: string | null }
interface Check { id: string; prompt: L10n; options: Record<string, string[]>; correct_index: number; reteach: L10n }
interface Content { title?: L10n; segments: Segment[]; checks: Check[]; delta?: { segments: Segment[]; checks: Check[] } }

interface ModuleResp {
  module: { id: string; layer: string; title: string; trade: string | null; section_key: string | null; project_id: string | null; expiry_days: number | null; archived_at: string | null }
  versions: { id: string; version: number; status: 'draft' | 'published'; change_policy: string; content_hash: string | null; published_at: string | null; published_by_name: string | null }[]
  can_edit: boolean
  languages: string[]
}

interface VersionResp {
  id: string
  version: number
  status: 'draft' | 'published'
  change_policy: 'full' | 'delta' | 'new_only'
  translations_reviewed: Record<string, { by: string; at: string }>
  content: Content
  content_hash: string | null
  problems: string[]
}

const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`
const LANG_LABEL: Record<string, string> = { en: 'English', es: 'Spanish' }

const POLICY_HELP: Record<string, string> = {
  full: 'Everyone who completed an earlier version must complete this module again.',
  delta: 'Workers who completed the previous version see only the delta section below.',
  new_only: 'Earlier completions stay valid; only new workers see this version.',
}

export default function ModuleEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const staff = useStaff()
  const mod = useAsync(() => staffApi.get<ModuleResp>(`/modules/${id}`), [id])
  const [versionId, setVersionId] = useState<string | null>(null)
  const [v, setV] = useState<VersionResp | null>(null)
  const [content, setContent] = useState<Content | null>(null)
  const [policy, setPolicy] = useState<'full' | 'delta' | 'new_only'>('full')
  const [reviewed, setReviewed] = useState<Record<string, { by: string; at: string } | null>>({})
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState({ title: '', expiry_days: '' })

  useEffect(() => {
    if (!mod.data) return
    setMeta({ title: mod.data.module.title, expiry_days: mod.data.module.expiry_days?.toString() ?? '' })
    if (!versionId || !mod.data.versions.some((x) => x.id === versionId)) {
      const draft = mod.data.versions.find((x) => x.status === 'draft')
      setVersionId((draft ?? mod.data.versions[0])?.id ?? null)
    }
  }, [mod.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadVersion = async (vid: string) => {
    const r = await staffApi.get<VersionResp>(`/versions/${vid}`)
    setV(r)
    setContent(r.content)
    setPolicy(r.change_policy)
    setReviewed(r.translations_reviewed ?? {})
    setDirty(false)
  }
  useEffect(() => {
    if (versionId) loadVersion(versionId).catch(setError)
  }, [versionId])

  const langs = mod.data?.languages ?? ['en', 'es']
  const editable = Boolean(mod.data?.can_edit && v?.status === 'draft')
  const backTo = mod.data?.module.project_id ? `/staff/projects/${mod.data.module.project_id}?tab=content` : '/staff/standard'

  const update = (fn: (c: Content) => Content) => {
    setContent((c) => (c ? fn(structuredClone(c)) : c))
    setDirty(true)
  }

  const run = async (fn: () => Promise<unknown>) => {
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

  const save = async () => {
    await staffApi.put(`/versions/${v!.id}`, { content, change_policy: policy, translations_reviewed: reviewed })
    await loadVersion(v!.id)
  }

  const reviewer = staff.fullName || staff.email || 'Reviewer'
  const deltaNeeded = policy === 'delta'
  const ensureDelta = () => update((c) => ({ ...c, delta: c.delta ?? { segments: [{ id: uid('d'), text: {} }], checks: [] } }))

  const versionLabel = useMemo(
    () => (x: ModuleResp['versions'][number]) => `v${x.version} — ${x.status === 'draft' ? 'draft' : `published ${fmtDateTime(x.published_at)}`}`,
    []
  )

  if (mod.loading) return <PageLoader />
  if (!mod.data) return <ErrorNote error={mod.error} />
  const m = mod.data.module

  return (
    <div className="space-y-5">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {m.layer === 'baseline' ? 'Owner baseline' : m.layer === 'trade' ? `Trade module · ${m.trade}` : 'Project layer'}
          </p>
          <h1 className="text-2xl font-bold">{m.title}</h1>
          {!mod.data.can_edit && (
            <p className="mt-1 flex items-center gap-1 text-sm text-gray-600">
              <Lock className="h-4 w-4" /> Read-only — this module is controlled by {m.layer === 'baseline' || !m.project_id ? 'the owner' : 'the project team'}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input-field w-auto" value={versionId ?? ''} onChange={(e) => (!dirty || confirm('Discard unsaved changes?')) && setVersionId(e.target.value)}>
            {mod.data.versions.map((x) => (
              <option key={x.id} value={x.id}>
                {versionLabel(x)}
              </option>
            ))}
          </select>
          {mod.data.can_edit && !mod.data.versions.some((x) => x.status === 'draft') && (
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const d = await staffApi.post<{ id: string }>(`/modules/${id}/draft`)
                  await mod.reload()
                  setVersionId(d.id)
                })
              }
            >
              <Plus className="h-4 w-4" /> New version
            </button>
          )}
        </div>
      </div>

      <ErrorNote error={error} />

      {mod.data.can_edit && (
        <form
          className="card flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await staffApi.put(`/modules/${id}`, { title: meta.title, expiry_days: meta.expiry_days ? Number(meta.expiry_days) : null })
              await mod.reload()
            })
          }}
        >
          <div className="min-w-[240px] flex-1">
            <label className="label">Module title (internal)</label>
            <input className="input-field" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Expiry override (days)</label>
            <input className="input-field w-36" type="number" min={1} placeholder="Default" value={meta.expiry_days} onChange={(e) => setMeta({ ...meta, expiry_days: e.target.value })} />
          </div>
          <button className="btn-secondary" disabled={busy}>
            Save details
          </button>
          <button
            type="button"
            className="ml-auto text-sm text-red-700 hover:underline"
            onClick={() =>
              confirm('Archive this module? It stops being required for new and existing workers.') &&
              run(async () => {
                await staffApi.post(`/modules/${id}/archive`)
                navigate(backTo)
              })
            }
          >
            Archive module
          </button>
        </form>
      )}

      {v && content && (
        <>
          {v.status === 'published' && (
            <p className="rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-700">
              Published versions are frozen so audits can retrieve exactly what each worker completed. Content hash <span className="font-mono">{v.content_hash}</span>
            </p>
          )}

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Title shown to workers</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {langs.map((l) => (
                <input
                  key={l}
                  className="input-field"
                  placeholder={`${LANG_LABEL[l] ?? l} title (defaults to module title)`}
                  value={content.title?.[l] ?? ''}
                  disabled={!editable}
                  onChange={(e) => update((c) => ({ ...c, title: { ...(c.title ?? {}), [l]: e.target.value } }))}
                />
              ))}
            </div>
          </section>

          <SegmentsEditor
            title="Content — short conversational messages"
            hint="Keep each message to one or two plain sentences. Every message is read aloud on the worker's phone."
            segments={content.segments}
            langs={langs}
            editable={editable}
            moduleId={id}
            onChange={(segments) => update((c) => ({ ...c, segments }))}
          />
          <ChecksEditor checks={content.checks} langs={langs} editable={editable} onChange={(checks) => update((c) => ({ ...c, checks }))} />

          {v.version > 1 && (
            <section className="card space-y-3 p-4">
              <h2 className="font-semibold">What happens to workers who completed an earlier version?</h2>
              <div className="flex flex-wrap gap-3">
                {(['full', 'delta', 'new_only'] as const).map((p) => (
                  <label key={p} className={clsx('flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm', policy === p ? 'border-brand-500 bg-brand-50' : 'border-gray-200')}>
                    <input
                      type="radio"
                      name="policy"
                      checked={policy === p}
                      disabled={!editable}
                      onChange={() => {
                        setPolicy(p)
                        setDirty(true)
                        if (p === 'delta') ensureDelta()
                      }}
                    />
                    <span>
                      <span className="block font-medium">{p === 'full' ? 'Full re-completion' : p === 'delta' ? 'Delta module' : 'New workers only'}</span>
                      <span className="block text-xs text-gray-600">{POLICY_HELP[p]}</span>
                    </span>
                  </label>
                ))}
              </div>
              {deltaNeeded && content.delta && (
                <div className="space-y-3 border-t pt-3">
                  <SegmentsEditor
                    title="Delta — what changed"
                    hint="Shown instead of the full module to workers who completed the previous version."
                    segments={content.delta.segments}
                    langs={langs}
                    editable={editable}
                    moduleId={id}
                    onChange={(segments) => update((c) => ({ ...c, delta: { ...c.delta!, segments } }))}
                  />
                  <ChecksEditor checks={content.delta.checks} langs={langs} editable={editable} onChange={(checks) => update((c) => ({ ...c, delta: { ...c.delta!, checks } }))} />
                </div>
              )}
            </section>
          )}

          {langs.filter((l) => l !== 'en').length > 0 && (
            <section className="card space-y-2 p-4">
              <h2 className="font-semibold">Translation review</h2>
              <p className="text-xs text-gray-600">
                Machine translation alone never publishes safety content. A qualified reviewer must confirm each translation means the same as the English — including the questions. Editing text clears the sign-off.
              </p>
              {langs
                .filter((l) => l !== 'en')
                .map((l) => (
                  <label key={l} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={Boolean(reviewed[l])}
                      onChange={(e) => {
                        setReviewed({ ...reviewed, [l]: e.target.checked ? { by: reviewer, at: new Date().toISOString() } : null })
                        setDirty(true)
                      }}
                    />
                    I reviewed the {LANG_LABEL[l] ?? l} translation of this version for meaning, not just wording
                    {reviewed[l] && <span className="text-xs text-gray-500">— {reviewed[l]!.by}, {fmtDateTime(reviewed[l]!.at)}</span>}
                  </label>
                ))}
            </section>
          )}

          {editable && (
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur">
              {v.problems.length > 0 && !dirty && (
                <details className="text-sm text-amber-900">
                  <summary className="cursor-pointer">{v.problems.length} item(s) to fix before publishing</summary>
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                    {v.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </details>
              )}
              {dirty && <span className="text-sm text-gray-600">Unsaved changes</span>}
              <div className="ml-auto flex gap-2">
                <button className="btn-secondary" disabled={busy || !dirty} onClick={() => run(save)}>
                  Save draft
                </button>
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (dirty) await save()
                      await staffApi.post(`/versions/${v.id}/publish`)
                      await mod.reload()
                      await loadVersion(v.id)
                    })
                  }
                >
                  Publish v{v.version}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SegmentsEditor({
  title,
  hint,
  segments,
  langs,
  editable,
  moduleId,
  onChange,
}: {
  title: string
  hint: string
  segments: Segment[]
  langs: string[]
  editable: boolean
  moduleId: string
  onChange: (s: Segment[]) => void
}) {
  const [err, setErr] = useState<unknown>(null)
  const set = (i: number, s: Segment) => onChange(segments.map((x, j) => (j === i ? s : x)))
  return (
    <section className="card">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-gray-600">{hint}</p>
      </div>
      <ErrorNote error={err} />
      <ol className="divide-y">
        {segments.map((s, i) => (
          <li key={s.id} className="flex gap-3 px-4 py-3">
            <span className="mt-2 w-6 shrink-0 text-right text-sm font-semibold text-gray-400">{i + 1}</span>
            <div className="grid flex-1 gap-2 md:grid-cols-2">
              {langs.map((l) => (
                <textarea
                  key={l}
                  className="input-field"
                  rows={3}
                  placeholder={LANG_LABEL[l] ?? l}
                  value={s.text[l] ?? ''}
                  disabled={!editable}
                  onChange={(e) => set(i, { ...s, text: { ...s.text, [l]: e.target.value } })}
                />
              ))}
              {(s.image_url || s.image_path) && (
                <div className="flex items-center gap-2 md:col-span-2">
                  {s.image_url && <img src={mediaUrl(s.image_url)!} alt="" className="h-24 rounded border" />}
                  {editable && (
                    <button className="text-xs text-red-700" onClick={() => set(i, { ...s, image_path: null, image_url: null })}>
                      Remove image
                    </button>
                  )}
                </div>
              )}
            </div>
            {editable && (
              <div className="flex shrink-0 flex-col gap-1">
                <label className="cursor-pointer rounded p-1.5 text-gray-500 hover:bg-gray-100" title="Add image or site map">
                  <ImagePlus className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      try {
                        const dataUrl = await new Promise<string>((res, rej) => {
                          const r = new FileReader()
                          r.onload = () => res(r.result as string)
                          r.onerror = rej
                          r.readAsDataURL(f)
                        })
                        const up = await staffApi.post<{ image_path: string; image_url: string }>('/media', { image: dataUrl, module_id: moduleId })
                        set(i, { ...s, image_path: up.image_path, image_url: up.image_url })
                      } catch (x) {
                        setErr(x)
                      }
                    }}
                  />
                </label>
                <button className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={segments.length <= 1} onClick={() => onChange(segments.filter((_, j) => j !== i))} title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <div className="border-t px-4 py-2">
          <button className="text-sm font-medium text-brand-700" onClick={() => onChange([...segments, { id: uid('s'), text: {} }])}>
            + Add message
          </button>
        </div>
      )}
    </section>
  )
}

function ChecksEditor({ checks, langs, editable, onChange }: { checks: Check[]; langs: string[]; editable: boolean; onChange: (c: Check[]) => void }) {
  const set = (i: number, c: Check) => onChange(checks.map((x, j) => (j === i ? c : x)))
  const optionCount = (c: Check) => Math.max(2, ...langs.map((l) => c.options[l]?.length ?? 0))
  return (
    <section className="card">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Comprehension checks</h2>
        <p className="text-xs text-gray-600">
          Workers must answer each correctly to finish. A wrong answer shows the re-teach text — explain the point in different words — and asks again with options shuffled. The answer is never revealed.
        </p>
      </div>
      {checks.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No checks. Most modules should have at least one.</p>}
      <ol className="divide-y">
        {checks.map((c, i) => {
          const n = optionCount(c)
          return (
            <li key={c.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-500">Question {i + 1}</span>
                {editable && (
                  <button className="text-gray-500 hover:text-red-700" onClick={() => onChange(checks.filter((_, j) => j !== i))} title="Remove question">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {langs.map((l) => (
                  <input key={l} className="input-field" placeholder={`Question (${LANG_LABEL[l] ?? l})`} value={c.prompt[l] ?? ''} disabled={!editable} onChange={(e) => set(i, { ...c, prompt: { ...c.prompt, [l]: e.target.value } })} />
                ))}
              </div>
              {Array.from({ length: n }).map((_, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <label className="flex w-24 shrink-0 items-center gap-1 text-xs text-gray-600">
                    <input type="radio" name={`correct-${c.id}`} checked={c.correct_index === oi} disabled={!editable} onChange={() => set(i, { ...c, correct_index: oi })} />
                    {c.correct_index === oi ? 'Correct' : `Option ${oi + 1}`}
                  </label>
                  <div className="grid flex-1 gap-2 md:grid-cols-2">
                    {langs.map((l) => (
                      <input
                        key={l}
                        className={clsx('input-field', c.correct_index === oi && 'border-green-400')}
                        value={c.options[l]?.[oi] ?? ''}
                        disabled={!editable}
                        onChange={(e) => {
                          const arr = [...(c.options[l] ?? [])]
                          while (arr.length < n) arr.push('')
                          arr[oi] = e.target.value
                          set(i, { ...c, options: { ...c.options, [l]: arr } })
                        }}
                      />
                    ))}
                  </div>
                  {editable && n > 2 && (
                    <button
                      className="text-gray-400 hover:text-red-700"
                      onClick={() =>
                        set(i, {
                          ...c,
                          options: Object.fromEntries(langs.map((l) => [l, (c.options[l] ?? []).filter((_, j) => j !== oi)])),
                          correct_index: c.correct_index === oi ? 0 : c.correct_index > oi ? c.correct_index - 1 : c.correct_index,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {editable && n < 6 && (
                <button className="text-xs font-medium text-brand-700" onClick={() => set(i, { ...c, options: Object.fromEntries(langs.map((l) => [l, [...(c.options[l] ?? Array(n).fill('')), '']])) })}>
                  + Add option
                </button>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {langs.map((l) => (
                  <textarea key={l} className="input-field border-amber-300 bg-amber-50/50" rows={2} placeholder={`Re-teach if wrong (${LANG_LABEL[l] ?? l})`} value={c.reteach[l] ?? ''} disabled={!editable} onChange={(e) => set(i, { ...c, reteach: { ...c.reteach, [l]: e.target.value } })} />
                ))}
              </div>
            </li>
          )
        })}
      </ol>
      {editable && (
        <div className="border-t px-4 py-2">
          <button
            className="text-sm font-medium text-brand-700"
            onClick={() => onChange([...checks, { id: uid('c'), prompt: {}, options: Object.fromEntries(langs.map((l) => [l, ['', '']])), correct_index: 0, reteach: {} }])}
          >
            + Add question
          </button>
        </div>
      )}
    </section>
  )
}
