import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wand2 } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { Empty, ErrorNote, PageLoader } from '@/components/ui'
import { PageTitle } from '@/components/StaffLayout'
import { ModuleList, type ModuleSummary } from '@/components/ModuleList'

interface StandardResp {
  company: { id: string; name: string }
  standard: { name: string; expiry_days: number; reminder_days: number[]; languages: string[]; retention_years: number }
  modules: ModuleSummary[]
  can_edit: boolean
}

/** Owner-level orientation standard (FR-8/FR-9): baseline + portfolio-wide trade modules. */
export default function Standard() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(() => staffApi.get<StandardResp>('/standard'), [])
  const [form, setForm] = useState({ name: '', expiry_days: '365', reminder_days: '30, 7, 1', languages: 'en, es', retention_years: '10' })
  const [err, setErr] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newMod, setNewMod] = useState({ layer: 'baseline', title: '', trade: '' })

  useEffect(() => {
    if (data)
      setForm({
        name: data.standard.name,
        expiry_days: String(data.standard.expiry_days),
        reminder_days: data.standard.reminder_days.join(', '),
        languages: data.standard.languages.join(', '),
        retention_years: String(data.standard.retention_years),
      })
  }, [data])

  if (loading) return <PageLoader />
  if (!data) return <ErrorNote error={error} />
  const baseline = data.modules.filter((m) => m.layer === 'baseline')
  const trade = data.modules.filter((m) => m.layer === 'trade')
  const nums = (s: string) => s.split(/[,\s]+/).filter(Boolean).map(Number)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Orientation standard" subtitle={`${data.company.name} — one baseline, enforced by every GC on every project.`} />
      <ErrorNote error={err} />
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr,360px]">
        <div className="space-y-6">
          <section className="card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Baseline curriculum</h2>
                <p className="text-xs text-gray-600">Required for every worker on every project. GCs can add to it, never remove or weaken it.</p>
              </div>
            </div>
            {baseline.length === 0 ? (
              <div className="p-4">
                <Empty title="No baseline yet">
                  Start from the Safety Mojo template (English + Spanish), then edit it for your sites. Template content needs your legal and translation review before it is published.
                  {data.can_edit && (
                    <div className="mt-3">
                      <button className="btn-primary" disabled={busy} onClick={() => run(() => staffApi.post('/standard/clone-template'))}>
                        <Wand2 className="h-4 w-4" /> Start from template
                      </button>
                    </div>
                  )}
                </Empty>
              </div>
            ) : (
              <ModuleList modules={baseline} />
            )}
          </section>
          <section className="card">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Portfolio trade modules</h2>
              <p className="text-xs text-gray-600">Added automatically for workers of that trade on every project.</p>
            </div>
            <ModuleList modules={trade} />
          </section>
          {data.can_edit && (
            <form
              className="card flex flex-wrap items-end gap-2 p-4"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  const m = await staffApi.post<{ id: string }>('/modules', {
                    layer: newMod.layer,
                    title: newMod.title,
                    trade: newMod.layer === 'trade' ? newMod.trade : undefined,
                  })
                  navigate(`/staff/modules/${m.id}`)
                })
              }}
            >
              <div>
                <label className="label">Layer</label>
                <select className="input-field" value={newMod.layer} onChange={(e) => setNewMod({ ...newMod, layer: e.target.value })}>
                  <option value="baseline">Baseline</option>
                  <option value="trade">Trade</option>
                </select>
              </div>
              {newMod.layer === 'trade' && (
                <div>
                  <label className="label">Trade</label>
                  <input className="input-field w-40" value={newMod.trade} onChange={(e) => setNewMod({ ...newMod, trade: e.target.value })} required />
                </div>
              )}
              <div className="min-w-[200px] flex-1">
                <label className="label">Title</label>
                <input className="input-field" value={newMod.title} onChange={(e) => setNewMod({ ...newMod, title: e.target.value })} required />
              </div>
              <button className="btn-secondary" disabled={busy}>
                <Plus className="h-4 w-4" /> Add module
              </button>
            </form>
          )}
        </div>

        <form
          className="card h-fit space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await staffApi.put('/standard', {
                name: form.name,
                expiry_days: Number(form.expiry_days),
                reminder_days: nums(form.reminder_days),
                languages: form.languages.split(/[,\s]+/).filter(Boolean),
                retention_years: Number(form.retention_years),
              })
              setSaved(true)
            })
          }}
        >
          <h2 className="font-semibold">Standard settings</h2>
          <div>
            <label className="label">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!data.can_edit} />
          </div>
          <div>
            <label className="label">Expires after (days)</label>
            <input className="input-field" type="number" min={1} value={form.expiry_days} onChange={(e) => setForm({ ...form, expiry_days: e.target.value })} disabled={!data.can_edit} />
          </div>
          <div>
            <label className="label">Reminders (days before expiry)</label>
            <input className="input-field" value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: e.target.value })} disabled={!data.can_edit} />
            <p className="mt-1 text-xs text-gray-500">Sent to the worker (text), their subcontractor admins and the GC team.</p>
          </div>
          <div>
            <label className="label">Languages</label>
            <input className="input-field" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} disabled={!data.can_edit} />
            <p className="mt-1 text-xs text-gray-500">Every module must be complete and human-reviewed in each language before it can be published.</p>
          </div>
          <div>
            <label className="label">Record retention (years)</label>
            <input className="input-field" type="number" min={1} value={form.retention_years} onChange={(e) => setForm({ ...form, retention_years: e.target.value })} disabled={!data.can_edit} />
          </div>
          {data.can_edit && <button className="btn-primary w-full" disabled={busy}>{saved ? 'Saved' : 'Save settings'}</button>}
        </form>
      </div>
    </>
  )
}
