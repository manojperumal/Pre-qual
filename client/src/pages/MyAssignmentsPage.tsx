import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useMyAssignments, AssignmentStatus } from '@/hooks/useQuestionnaires'
import { ClipboardList } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_BADGE: Record<AssignmentStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

const FILL_OUT_STATUSES: AssignmentStatus[] = ['pending', 'in_progress', 'needs_more_info']
const VIEW_STATUSES: AssignmentStatus[] = ['submitted', 'approved', 'rejected']

export default function MyAssignmentsPage() {
  const { profile } = useAuth()
  const { data: assignments = [], isLoading } = useMyAssignments(profile?.id)

  const role = profile?.role ?? 'trade'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
        <p className="mt-1 text-sm text-gray-500">Questionnaires assigned to you</p>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <ClipboardList size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No assignments yet</p>
            <p className="text-sm mt-1">Questionnaires assigned to you will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Questionnaire', 'Project', 'Assigned By', 'Due Date', 'Status', 'Action'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assignments.map((a) => {
                  const isFillOut = FILL_OUT_STATUSES.includes(a.status)
                  const isView = VIEW_STATUSES.includes(a.status)
                  const actionPath = isFillOut
                    ? `/${role}/assignments/${a.id}/respond`
                    : `/${role}/assignments/${a.id}/review`

                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {a.questionnaire?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.project?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.assigner?.company_name || a.assigner?.full_name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {a.due_date ? format(new Date(a.due_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                          {a.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {(isFillOut || isView) && (
                          <Link
                            to={actionPath}
                            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                          >
                            {isFillOut ? 'Fill Out' : 'View'}
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
