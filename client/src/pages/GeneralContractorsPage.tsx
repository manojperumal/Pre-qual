import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useOwnerGCs } from '@/hooks/useProjects'
import { format } from 'date-fns'
import { HardHat, UserPlus, FolderPlus } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return format(new Date(d), 'MMM d, yyyy')
}

export default function GeneralContractorsPage() {
  const { profile } = useAuth()
  const { data: rows = [], isLoading } = useOwnerGCs(profile?.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">General Contractors</h1>
          <p className="mt-1 text-sm text-gray-500">All GCs across your projects and their pre-qual status</p>
        </div>
        <Link
          to="/owner/invite?role=gc&from=general-contractors"
          className="btn-primary inline-flex items-center gap-2 text-sm py-2 px-4"
        >
          <UserPlus size={16} />
          Invite GC
        </Link>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <HardHat size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">No general contractors yet</p>
            <p className="text-sm mt-1">Invite a GC to one of your projects to see them here</p>
            <Link
              to="/owner/invite?role=gc&from=general-contractors"
              className="btn-primary mt-4 inline-flex items-center gap-2 text-sm"
            >
              <UserPlus size={16} />
              Invite GC
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['GC / Company', 'Project', 'Start Date', 'End Date', 'Pre-Qual Status', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((row) => (
                  <tr key={row.memberId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{row.contractorName || row.contractorEmail || '—'}</p>
                      {row.companyName && <p className="text-xs text-gray-500 mt-0.5">{row.companyName}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/owner/projects/${row.projectId}`}
                        className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {row.projectName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{fmt(row.startDate)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{fmt(row.endDate)}</td>
                    <td className="px-6 py-4">
                      {row.submissionStatus ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.submissionStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.submissionStatus.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Not started</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {row.contractorEmail && (
                        <Link
                          to={`/owner/invite?role=gc&email=${encodeURIComponent(row.contractorEmail)}&from=general-contractors`}
                          className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap"
                          title="Add to another project"
                        >
                          <FolderPlus size={14} />
                          Add to Project
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
