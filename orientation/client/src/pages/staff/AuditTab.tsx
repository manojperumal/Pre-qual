import { Link } from 'react-router-dom'
import { staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fmtDateTime } from '@/lib/status'
import { ErrorNote, PageLoader } from '@/components/ui'
import type { ProjectDetail } from './ProjectPage'

export function AuditTab({ project }: { project: ProjectDetail }) {
  const { data, error, loading } = useAsync(() => staffApi.get<any[]>(`/projects/${project.id}/audit`), [project.id])
  if (loading) return <PageLoader />
  return (
    <div className="card overflow-hidden">
      <ErrorNote error={error} />
      <p className="border-b bg-gray-50 px-4 py-2 text-xs text-gray-600">
        Append-only and hash-chained: entries cannot be edited or deleted; corrections appear as new entries. Showing the latest 500.
      </p>
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2">Worker</th>
            <th className="px-3 py-2">By</th>
            <th className="px-3 py-2">Hash</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(a.created_at)}</td>
              <td className="px-3 py-2">
                <span className="font-medium">{a.event.replace(/_/g, ' ')}</span>
                {a.payload?.reason && <span className="block text-xs text-gray-600">{a.payload.reason}</span>}
                {a.payload?.title && <span className="block text-xs text-gray-600">{a.payload.title}{a.payload.version ? ` v${a.payload.version}` : ''}</span>}
              </td>
              <td className="px-3 py-2">{a.enrollment_id ? <Link className="text-brand-700 hover:underline" to={`/staff/workers/${a.enrollment_id}`}>{a.worker_name ?? 'worker'}</Link> : '—'}</td>
              <td className="px-3 py-2 text-xs">{a.actor_label ?? a.actor_type}</td>
              <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{a.hash.slice(0, 12)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
