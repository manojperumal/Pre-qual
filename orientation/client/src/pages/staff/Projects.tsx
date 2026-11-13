import { Link } from 'react-router-dom'
import { ChevronRight, MapPin } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import type { Status } from '@/lib/status'
import { Empty, ErrorNote, PageLoader } from '@/components/ui'
import { PageTitle, useStaff } from '@/components/StaffLayout'

interface ProjectRow {
  id: string
  name: string
  address: string | null
  owner_company: string | null
  join_code: string | null
  ready_at: string | null
  role: string
  counts: Record<Status, number>
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', gc: 'General contractor', trade: 'Subcontractor', mojo: 'Mojo admin' }

export default function Projects() {
  const staff = useStaff()
  const { data, error, loading } = useAsync(() => staffApi.get<ProjectRow[]>('/projects'), [], 30000)
  if (loading) return <PageLoader />
  return (
    <>
      <PageTitle title="Projects" subtitle={`Site orientation and worker clearance — ${staff.companyName ?? 'Safety Mojo'}`} />
      <ErrorNote error={error} />
      {data && data.length === 0 && <Empty title="No projects yet">Projects come from Pre-Qual. Once you are on a project there, it appears here.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => {
          const total = Object.values(p.counts).reduce((a, b) => a + b, 0)
          const blocked = total - p.counts.cleared
          return (
            <Link key={p.id} to={`/staff/projects/${p.id}`} className="card group p-4 transition hover:border-brand-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{p.name}</p>
                  {p.address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                      <MapPin className="h-3 w-3" /> {p.address}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-brand-500" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{ROLE_LABEL[p.role]}</span>
                {p.ready_at ? (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">Orientation open</span>
                ) : (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">Not open yet</span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold text-green-700">{p.counts.cleared}</p>
                  <p className="text-xs text-gray-500">Cleared</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{p.counts.in_progress + p.counts.not_started + p.counts.pending_verification + p.counts.refresh_required}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
                <div>
                  <p className={`text-xl font-bold ${p.counts.expired + p.counts.revoked + p.counts.suspended ? 'text-red-700' : 'text-gray-900'}`}>
                    {p.counts.expired + p.counts.revoked + p.counts.suspended}
                  </p>
                  <p className="text-xs text-gray-500">Expired / revoked</p>
                </div>
              </div>
              {total > 0 && (
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-gray-100" title={`${blocked} of ${total} not cleared`}>
                  <div className="bg-green-500" style={{ width: `${(p.counts.cleared / total) * 100}%` }} />
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </>
  )
}
