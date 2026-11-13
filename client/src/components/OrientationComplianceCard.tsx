import { useQuery } from '@tanstack/react-query'
import { HardHat } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Row {
  project_id: string
  project_name: string
  workers: number
  cleared: number
  pending: number
  expired: number
  revoked: number
  compliance_rate: number
}

const ORIENTATION_URL = (import.meta.env.VITE_ORIENTATION_URL as string | undefined)?.replace(/\/$/, '')

/**
 * Site orientation compliance for a contractor company, from the Safety Mojo
 * Orientation module (shared database, `orient_company_compliance`). Shown
 * next to pre-qualification status on the contractor's record (Orientation PRD FR-26).
 */
export default function OrientationComplianceCard({ companyId, projectId }: { companyId: string | null | undefined; projectId?: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['orient_company_compliance', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('orient_company_compliance', { p_company_id: companyId })
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })

  if (!companyId) return null
  // The orientation module may not be deployed yet — hide rather than show an error.
  if (error) return null

  const totals = (data ?? []).reduce(
    (a, r) => ({ workers: a.workers + r.workers, cleared: a.cleared + r.cleared, pending: a.pending + r.pending, lapsed: a.lapsed + r.expired + r.revoked }),
    { workers: 0, cleared: 0, pending: 0, lapsed: 0 }
  )
  const rate = totals.workers ? Math.round((totals.cleared / totals.workers) * 100) : null
  const thisProject = projectId ? data?.find((r) => r.project_id === projectId) : undefined

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <HardHat size={18} className="text-brand-600" /> Site Orientation
        </h2>
        {ORIENTATION_URL && (
          <a href={`${ORIENTATION_URL}/staff${projectId ? `/projects/${projectId}?company=${companyId}` : ''}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">
            Open in Orientation →
          </a>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">No workers from this company have registered for site orientation yet.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-gray-900">{rate}%</p>
              <p className="text-xs text-gray-500">Compliance (all projects)</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-700">{totals.cleared}</p>
              <p className="text-xs text-gray-500">Cleared</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{totals.pending}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
            <div>
              <p className={`text-xl font-bold ${totals.lapsed ? 'text-red-600' : 'text-gray-900'}`}>{totals.lapsed}</p>
              <p className="text-xs text-gray-500">Expired / revoked</p>
            </div>
          </div>
          {thisProject && (
            <p className="rounded bg-gray-50 px-3 py-2 text-gray-700">
              On this project: <strong>{thisProject.cleared}</strong> of {thisProject.workers} worker(s) cleared
              {thisProject.expired + thisProject.revoked > 0 && <span className="text-red-600"> · {thisProject.expired + thisProject.revoked} expired/revoked</span>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
