import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, Download, Search } from 'lucide-react'
import { downloadExport, staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fmtDate, STATUS_LABEL, STATUS_ORDER, type Status } from '@/lib/status'
import { ErrorNote, PageLoader, StatusBadge } from '@/components/ui'
import { PageTitle } from '@/components/StaffLayout'
import { StatTile } from '@/components/StatTile'
import { GateTab } from './GateTab'
import { RosterTab } from './RosterTab'
import { ContentTab } from './ContentTab'
import { SettingsTab } from './SettingsTab'
import { AuditTab } from './AuditTab'

export interface ProjectDetail {
  id: string
  name: string
  address: string | null
  owner_company: string | null
  owner_company_id: string | null
  role: 'owner' | 'gc' | 'trade' | 'mojo'
  settings: {
    join_code: string
    join_url: string
    expiry_days: number | null
    open_days_before_start: number
    ready_at: string | null
    api_key_prefix: string | null
  }
  companies: { id: string; name: string; type: string }[]
}

const TABS = [
  { key: 'compliance', label: 'Compliance', roles: ['owner', 'gc', 'trade', 'mojo'] },
  { key: 'gate', label: 'Gate check', roles: ['owner', 'gc', 'trade', 'mojo'] },
  { key: 'roster', label: 'Crew roster', roles: ['owner', 'gc', 'trade', 'mojo'] },
  { key: 'content', label: 'Orientation content', roles: ['owner', 'gc', 'mojo'] },
  { key: 'settings', label: 'Settings & access', roles: ['owner', 'gc', 'mojo'] },
  { key: 'audit', label: 'Audit log', roles: ['owner', 'gc', 'mojo'] },
]

export default function ProjectPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'compliance'
  const { data: project, error, loading, reload } = useAsync(() => staffApi.get<ProjectDetail>(`/projects/${id}`), [id])

  if (loading) return <PageLoader />
  if (!project) return <ErrorNote error={error} />

  const tabs = TABS.filter((t) => t.roles.includes(project.role))
  return (
    <>
      <PageTitle
        title={project.name}
        subtitle={
          <>
            {project.address && <>{project.address} · </>}
            Owner: {project.owner_company ?? '—'} · Project code <span className="font-mono font-semibold">{project.settings.join_code}</span>
            {!project.settings.ready_at && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Orientation not open</span>}
          </>
        }
      />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'compliance' && <ComplianceTab project={project} />}
      {tab === 'gate' && <GateTab project={project} />}
      {tab === 'roster' && <RosterTab project={project} />}
      {tab === 'content' && <ContentTab project={project} onChange={reload} />}
      {tab === 'settings' && <SettingsTab project={project} onChange={reload} />}
      {tab === 'audit' && <AuditTab project={project} />}
    </>
  )
}

interface ComplianceRow {
  enrollment_id: string
  full_name: string
  phone: string
  company_id: string | null
  company_name: string | null
  employer_unlisted: boolean
  crew: string | null
  trade: string | null
  start_date: string | null
  effective_status: Status
  expires_at: string | null
  identity_verified: boolean
  expected_today: boolean
  flag_due_soon: boolean
}

interface Compliance {
  role: string
  summary: Record<Status, number> & { total: number; expected_today_not_cleared: number; starting_within_24h_incomplete: number }
  companies: { id: string | null; name: string; total: number; counts: Record<Status, number> }[]
  rows: ComplianceRow[]
}

/** FR-18 live compliance view: polls every 15s. */
function ComplianceTab({ project }: { project: ProjectDetail }) {
  const { data, error, loading } = useAsync(() => staffApi.get<Compliance>(`/projects/${project.id}/compliance`), [project.id], 15000)
  const [params, setParams] = useSearchParams()
  const company = params.get('company') || ''
  const status = params.get('status') || ''
  const [crew, setCrew] = useState('')
  const [trade, setTrade] = useState('')
  const [q, setQ] = useState('')
  const [exportErr, setExportErr] = useState<unknown>(null)
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    if (!data) return []
    return data.rows.filter(
      (r) =>
        (!company || (r.company_id ?? `name:${r.company_name}`) === company) &&
        (!status ||
          (status === 'today' ? r.expected_today && r.effective_status !== 'cleared' : status === 'due_soon' ? r.flag_due_soon : r.effective_status === status)) &&
        (!crew || r.crew === crew) &&
        (!trade || (r.trade ?? '') === trade) &&
        (!q || r.full_name.toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q))
    )
  }, [data, company, status, crew, trade, q])

  if (loading) return <PageLoader />
  if (!data) return <ErrorNote error={error} />
  const s = data.summary
  const crews = [...new Set(data.rows.map((r) => r.crew).filter(Boolean))] as string[]
  const trades = [...new Set(data.rows.map((r) => r.trade ?? ''))]

  return (
    <div className="space-y-5">
      <ErrorNote error={error || exportErr} />
      <button
        type="button"
        onClick={() => set('status', status === 'today' ? '' : 'today')}
        className={clsx(
          'flex w-full items-center gap-4 rounded-lg border-2 px-5 py-4 text-left',
          s.expected_today_not_cleared ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50',
          status === 'today' && 'ring-2 ring-brand-500'
        )}
      >
        <span className={clsx('text-4xl font-bold tabular-nums', s.expected_today_not_cleared ? 'text-red-700' : 'text-green-700')}>{s.expected_today_not_cleared}</span>
        <span>
          <span className="block font-semibold text-gray-900">Workers expected on site today who are not cleared</span>
          <span className="block text-sm text-gray-600">The answer should be zero. Workers whose start date is today or earlier.</span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatTile label="Total" value={s.total} onClick={() => set('status', '')} active={!status} />
        {STATUS_ORDER.map((k) => (
          <StatTile
            key={k}
            label={STATUS_LABEL[k].en}
            value={s[k]}
            tone={k === 'cleared' ? 'good' : ['expired', 'revoked', 'suspended'].includes(k) ? (s[k] ? 'bad' : 'default') : k === 'refresh_required' && s[k] ? 'warn' : 'default'}
            onClick={() => set('status', status === k ? '' : k)}
            active={status === k}
          />
        ))}
      </div>
      {s.starting_within_24h_incomplete > 0 && (
        <button onClick={() => set('status', 'due_soon')} className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="h-4 w-4" /> {s.starting_within_24h_incomplete} worker(s) start within 24 hours and have not finished orientation
        </button>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <input className="input-field w-48 pl-8" placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input-field w-auto" value={company} onChange={(e) => set('company', e.target.value)}>
            <option value="">All companies</option>
            {data.companies.map((c) => (
              <option key={c.id ?? c.name} value={c.id ?? `name:${c.name}`}>
                {c.name} ({c.total})
              </option>
            ))}
          </select>
          <select className="input-field w-auto" value={crew} onChange={(e) => setCrew(e.target.value)}>
            <option value="">All crews</option>
            {crews.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="input-field w-auto" value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">All trades</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t || 'General'}
              </option>
            ))}
          </select>
          <div className="ml-auto flex gap-2">
            {(['csv', 'pdf'] as const).map((f) => (
              <button
                key={f}
                className="btn-secondary"
                onClick={() =>
                  downloadExport(
                    company && !company.startsWith('name:')
                      ? { scope: 'company', id: company, project_id: project.id, format: f }
                      : { scope: 'project', id: project.id, format: f }
                  ).catch(setExportErr)
                }
              >
                <Download className="h-4 w-4" /> {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Crew</th>
                <th className="px-3 py-2">Trade</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.enrollment_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link className="font-medium text-brand-700 hover:underline" to={`/staff/workers/${r.enrollment_id}`}>
                      {r.full_name}
                    </Link>
                    <span className="block text-xs text-gray-500">{r.phone}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.company_name}
                    {r.employer_unlisted && <span className="ml-1 text-xs text-amber-700">(not on project)</span>}
                  </td>
                  <td className="px-3 py-2">{r.crew ?? '—'}</td>
                  <td className="px-3 py-2">{r.trade ?? 'General'}</td>
                  <td className="px-3 py-2">
                    {fmtDate(r.start_date)}
                    {r.flag_due_soon && <AlertTriangle className="ml-1 inline h-4 w-4 text-amber-600" aria-label="Starts within 24h, incomplete" />}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.effective_status} />
                  </td>
                  <td className="px-3 py-2">{fmtDate(r.expires_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    No workers match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
