import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, Plus, Wand2 } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { ErrorNote, PageLoader } from '@/components/ui'
import { ModuleList, type ModuleSummary } from '@/components/ModuleList'
import type { ProjectDetail } from './ProjectPage'

interface ProjectModules {
  role: string
  can_edit: boolean
  sections: { key: string; title: string }[]
  project_modules: ModuleSummary[]
  owner_modules: ModuleSummary[]
}

interface Readiness {
  ready: boolean
  ready_at: string | null
  items: { key: string; title: string; ok: boolean; detail?: string }[]
}

/** Project layer + trade layer authoring, and the FR-11 publishing checklist. */
export function ContentTab({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const navigate = useNavigate()
  const mods = useAsync(() => staffApi.get<ProjectModules>(`/projects/${project.id}/modules`), [project.id])
  const ready = useAsync(() => staffApi.get<Readiness>(`/projects/${project.id}/readiness`), [project.id])
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [newTrade, setNewTrade] = useState({ trade: '', title: '' })

  if (mods.loading || ready.loading) return <PageLoader />
  if (!mods.data || !ready.data) return <ErrorNote error={mods.error || ready.error} />
  const sectionTitle = (k: string | null) => mods.data!.sections.find((s) => s.key === k)?.title ?? null
  const projectLayer = mods.data.project_modules.filter((m) => m.layer === 'project')
  const projectTrade = mods.data.project_modules.filter((m) => m.layer === 'trade')
  const ownerBaseline = mods.data.owner_modules.filter((m) => m.layer === 'baseline')
  const ownerTrade = mods.data.owner_modules.filter((m) => m.layer === 'trade')

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await Promise.all([mods.reload(), ready.reload()])
      onChange()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
      <div className="space-y-6">
        <ErrorNote error={error} />
        <section className="card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="font-semibold">Project layer</h2>
              <p className="text-xs text-gray-600">Site-specific hazards, emergency procedures, muster points and rules for this project.</p>
            </div>
            {mods.data.can_edit && projectLayer.length < mods.data.sections.length && (
              <button className="btn-secondary" disabled={busy} onClick={() => run(() => staffApi.post(`/projects/${project.id}/sections/scaffold`))}>
                <Wand2 className="h-4 w-4" /> Add required sections
              </button>
            )}
          </div>
          <ModuleList modules={projectLayer} sectionTitle={sectionTitle} />
        </section>

        <section className="card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Trade layer</h2>
            <p className="text-xs text-gray-600">Extra modules assigned to workers by trade. Owner trade modules apply to every project in the portfolio.</p>
          </div>
          <ModuleList modules={projectTrade} />
          {ownerTrade.length > 0 && (
            <>
              <p className="border-t bg-gray-50 px-4 py-1.5 text-xs font-semibold uppercase text-gray-500">From the owner standard</p>
              <ModuleList modules={ownerTrade} readOnly={project.role === 'gc'} />
            </>
          )}
          {mods.data.can_edit && (
            <form
              className="flex flex-wrap gap-2 border-t px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  const m = await staffApi.post<{ id: string }>('/modules', { layer: 'trade', project_id: project.id, ...newTrade })
                  navigate(`/staff/modules/${m.id}`)
                })
              }}
            >
              <input className="input-field w-40" placeholder="Trade (e.g. Electrical)" value={newTrade.trade} onChange={(e) => setNewTrade({ ...newTrade, trade: e.target.value })} required />
              <input className="input-field flex-1" placeholder="Module title" value={newTrade.title} onChange={(e) => setNewTrade({ ...newTrade, title: e.target.value })} required />
              <button className="btn-secondary" disabled={busy}>
                <Plus className="h-4 w-4" /> Add trade module
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Owner baseline — {project.owner_company}</h2>
            <p className="text-xs text-gray-600">
              Set by the owner and required on every project. {project.role === 'gc' ? 'You can add to it on this project but cannot change or remove it.' : ''}
            </p>
          </div>
          <ModuleList modules={ownerBaseline} readOnly={project.role !== 'owner' && project.role !== 'mojo'} />
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card p-4">
          <h2 className="font-semibold">Publishing checklist</h2>
          <p className="mb-3 text-xs text-gray-600">Every item must be published before workers can start.</p>
          <ul className="space-y-2 text-sm">
            {ready.data.items.map((i) => (
              <li key={i.key} className="flex gap-2">
                {i.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />}
                <span>
                  <span className={i.ok ? 'text-gray-900' : 'font-medium text-gray-900'}>{i.title}</span>
                  {!i.ok && <span className="block text-xs text-gray-500">{i.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          {mods.data.can_edit && (
            <div className="mt-4 border-t pt-3">
              {ready.data.ready_at ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-700">Orientation is open to workers.</p>
                  <button className="btn-secondary w-full" disabled={busy} onClick={() => confirm('Close orientation for new workers?') && run(() => staffApi.post(`/projects/${project.id}/ready`, { ready: false }))}>
                    Close orientation
                  </button>
                </div>
              ) : (
                <button className="btn-primary w-full" disabled={busy || !ready.data.ready} onClick={() => run(() => staffApi.post(`/projects/${project.id}/ready`, { ready: true }))}>
                  Open orientation to workers
                </button>
              )}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
