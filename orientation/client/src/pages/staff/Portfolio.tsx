import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import type { Status } from '@/lib/status'
import { Empty, ErrorNote, PageLoader } from '@/components/ui'
import { PageTitle } from '@/components/StaffLayout'
import { StatTile } from '@/components/StatTile'

type Counts = Record<Status, number> & { total: number; expected_today_not_cleared: number }
interface Portfolio {
  totals: Counts
  projects: {
    id: string
    name: string
    address: string | null
    ready_at: string | null
    counts: Counts
    gcs: { id: string; name: string }[]
    companies: ({ id: string | null; name: string } & Counts)[]
  }[]
}

const pending = (c: Counts) => c.not_started + c.in_progress + c.pending_verification + c.refresh_required
const lapsed = (c: Counts) => c.expired + c.revoked + c.suspended

/**
 * FR-19 owner portfolio: portfolio → project → subcontractor → worker in at
 * most four clicks (expand project, click company, click worker).
 */
export default function PortfolioPage() {
  const { data, error, loading } = useAsync(() => staffApi.get<Portfolio>('/portfolio'), [], 30000)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (loading) return <PageLoader />
  if (!data) return <ErrorNote error={error} />
  const t = data.totals

  return (
    <>
      <PageTitle title="Portfolio orientation compliance" subtitle="Live across every project and contractor in your portfolio." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className={`card col-span-2 px-4 py-3 sm:col-span-1 ${t.expected_today_not_cleared ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
          <p className={`text-3xl font-bold ${t.expected_today_not_cleared ? 'text-red-700' : 'text-green-700'}`}>{t.expected_today_not_cleared}</p>
          <p className="text-xs font-medium text-gray-700">On site today, not cleared</p>
        </div>
        <StatTile label="Workers" value={t.total} />
        <StatTile label="Cleared" value={t.cleared} tone="good" />
        <StatTile label="Pending" value={pending(t)} />
        <StatTile label="Expired / revoked" value={lapsed(t)} tone={lapsed(t) ? 'bad' : 'default'} />
      </div>
      {data.projects.length === 0 && <Empty title="No owner projects">Projects you own in Pre-Qual appear here.</Empty>}
      {data.projects.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Project / contractor</th>
                <th className="px-3 py-2">GC</th>
                <th className="px-3 py-2 text-right">Not cleared today</th>
                <th className="px-3 py-2 text-right">Workers</th>
                <th className="px-3 py-2 text-right">Cleared</th>
                <th className="px-3 py-2 text-right">Pending</th>
                <th className="px-3 py-2 text-right">Expired / revoked</th>
                <th className="px-3 py-2">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.projects.map((p) => {
                const c = p.counts
                const rate = c.total ? Math.round((c.cleared / c.total) * 100) : null
                return (
                  <Fragment key={p.id}>
                    <tr className="cursor-pointer bg-white hover:bg-gray-50" onClick={() => setOpen({ ...open, [p.id]: !open[p.id] })}>
                      <td className="px-3 py-2 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          {open[p.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {p.name}
                        </span>
                        {!p.ready_at && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-normal text-amber-900">not open</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{p.gcs.map((g) => g.name).join(', ') || '—'}</td>
                      <td className={`px-3 py-2 text-right font-bold ${c.expected_today_not_cleared ? 'text-red-700' : 'text-gray-400'}`}>{c.expected_today_not_cleared}</td>
                      <td className="px-3 py-2 text-right">{c.total}</td>
                      <td className="px-3 py-2 text-right text-green-700">{c.cleared}</td>
                      <td className="px-3 py-2 text-right">{pending(c)}</td>
                      <td className={`px-3 py-2 text-right ${lapsed(c) ? 'text-red-700' : ''}`}>{lapsed(c)}</td>
                      <td className="px-3 py-2">
                        {rate === null ? '—' : (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-20 overflow-hidden rounded bg-gray-200">
                              <span className="block h-full bg-green-500" style={{ width: `${rate}%` }} />
                            </span>
                            {rate}%
                          </span>
                        )}
                      </td>
                    </tr>
                    {open[p.id] &&
                      p.companies.map((co) => (
                        <tr key={`${p.id}-${co.id ?? co.name}`} className="bg-gray-50/60">
                          <td className="py-1.5 pl-10 pr-3">
                            <Link className="text-brand-700 hover:underline" to={`/staff/projects/${p.id}?tab=compliance${co.id ? `&company=${co.id}` : ''}`}>
                              {co.name}
                            </Link>
                          </td>
                          <td />
                          <td className={`px-3 py-1.5 text-right ${co.expected_today_not_cleared ? 'font-bold text-red-700' : 'text-gray-400'}`}>{co.expected_today_not_cleared}</td>
                          <td className="px-3 py-1.5 text-right">{co.total}</td>
                          <td className="px-3 py-1.5 text-right text-green-700">{co.cleared}</td>
                          <td className="px-3 py-1.5 text-right">{pending(co)}</td>
                          <td className={`px-3 py-1.5 text-right ${lapsed(co) ? 'text-red-700' : ''}`}>{lapsed(co)}</td>
                          <td className="px-3 py-1.5">{co.total ? `${Math.round((co.cleared / co.total) * 100)}%` : '—'}</td>
                        </tr>
                      ))}
                    {open[p.id] && p.companies.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-2 pl-10 text-xs text-gray-500">
                          No workers registered yet. <Link className="text-brand-700" to={`/staff/projects/${p.id}`}>Open project</Link>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
