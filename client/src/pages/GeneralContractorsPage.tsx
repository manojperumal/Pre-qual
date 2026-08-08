import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useOwnerGCs } from '@/hooks/useProjects'
import { useContractorProfileCompleteness } from '@/hooks/useContractorProfile'
import { getCompanyLogoUrl } from '@/hooks/useCompany'
import { HardHat, UserPlus, FolderPlus, User, CheckCircle, Clock } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

const AWAITING_REVIEW_STATUSES = ['submitted', 'under_review']

function cityState(city: string | null, state: string | null) {
  if (!city && !state) return '—'
  return [city, state].filter(Boolean).join(', ')
}

export default function GeneralContractorsPage() {
  const { profile } = useAuth()
  const { data: rows = [], isLoading } = useOwnerGCs(profile?.id)
  const { data: completeness = new Map<string, boolean>() } = useContractorProfileCompleteness(
    rows.map((r) => r.contractorId)
  )

  const activeCount = new Set(rows.map((r) => r.contractorId)).size
  const awaitingReviewCount = new Set(
    rows.filter((r) => AWAITING_REVIEW_STATUSES.includes(r.submissionStatus ?? '')).map((r) => r.contractorId)
  ).size

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        <div className="card px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Active GCs</p>
            <p className="text-xl font-bold text-green-600">{activeCount}</p>
          </div>
        </div>
        <div className="card px-5 py-4 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${awaitingReviewCount > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <Clock size={18} className={awaitingReviewCount > 0 ? 'text-amber-600' : 'text-gray-500'} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Awaiting Review GCs</p>
            <p className={`text-xl font-bold ${awaitingReviewCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{awaitingReviewCount}</p>
          </div>
        </div>
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
                  {['Name', 'City/State', 'Status', 'Project', 'Actions'].map((h) => (
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
                      <div className="flex items-center gap-3">
                        {row.logoPath ? (
                          <img src={getCompanyLogoUrl(row.logoPath) ?? undefined} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{row.contractorName || row.contractorEmail || '—'}</p>
                          {row.companyName && <p className="text-xs text-gray-500 mt-0.5">{row.companyName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{cityState(row.city, row.state)}</td>
                    <td className="px-6 py-4">
                      {row.submissionStatus ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.submissionStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.submissionStatus.replace(/_/g, ' ')}
                        </span>
                      ) : completeness.get(row.contractorId) ? (
                        <span className="text-xs text-gray-400 italic">Not started</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Profile incomplete</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/owner/projects/${row.projectId}`}
                        className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {row.projectName}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/owner/general-contractors/${row.contractorId}`}
                          className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap"
                        >
                          <User size={14} />
                          View Profile
                        </Link>
                        {row.contractorEmail && (
                          <Link
                            to={`/owner/invite?role=gc&email=${encodeURIComponent(row.contractorEmail)}&from=general-contractors`}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium whitespace-nowrap"
                            title="Add to another project"
                          >
                            <FolderPlus size={14} />
                            Add to Project
                          </Link>
                        )}
                      </div>
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
