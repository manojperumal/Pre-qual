import { Link, useParams, useLocation } from 'react-router-dom'
import { useQuestionnaireAssignments, useExemptAssignment, AssignmentStatus } from '@/hooks/useQuestionnaires'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_more_info: 'More Info Requested',
}

const REVIEWABLE: AssignmentStatus[] = ['submitted', 'approved', 'rejected']

export default function QuestionnaireAssignmentsPage() {
  const { questionnaireId } = useParams<{ questionnaireId: string }>()
  const location = useLocation()
  const basePath = '/' + location.pathname.split('/')[1]

  const { data: assignments = [], isLoading } = useQuestionnaireAssignments(questionnaireId)
  const exemptAssignment = useExemptAssignment()

  const questionnaireName = assignments[0]?.questionnaire?.name ?? 'Questionnaire'
  const activeAssignments = assignments.filter((a) => !a.is_exempt)

  const counts = {
    total: activeAssignments.length,
    pending: activeAssignments.filter((a) => a.status === 'pending' || a.status === 'in_progress').length,
    submitted: activeAssignments.filter((a) => a.status === 'submitted').length,
    approved: activeAssignments.filter((a) => a.status === 'approved').length,
    needsAttention: activeAssignments.filter((a) => a.status === 'rejected' || a.status === 'needs_more_info').length,
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to={`${basePath}/questionnaires`} className="hover:text-brand-600 transition-colors">Questionnaires</Link>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-medium">Assignments</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{questionnaireName}</h1>
          <p className="mt-1 text-sm text-gray-500">Every company/project this questionnaire has been assigned to</p>
        </div>
        <Link to={`${basePath}/questionnaires/assign?questionnaireId=${questionnaireId}`} className="btn-primary text-sm">
          Assign to more
        </Link>
      </div>

      {!isLoading && activeAssignments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Assigned', value: counts.total, color: 'text-gray-700', bg: 'bg-gray-50' },
            { label: 'Awaiting Response', value: counts.pending, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Submitted', value: counts.submitted, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Needs Attention', value: counts.needsAttention, color: counts.needsAttention > 0 ? 'text-red-600' : 'text-gray-500', bg: counts.needsAttention > 0 ? 'bg-red-50' : 'bg-gray-50' },
          ].map((s) => (
            <div key={s.label} className={`card px-4 py-3 ${s.bg}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : activeAssignments.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-700">Not assigned to anyone yet</p>
          <p className="text-sm mt-1">Assign this questionnaire to a company or project to see status here</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Company', 'Project', 'Completed By', 'Due', 'Status', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {activeAssignments.map((a) => {
                  const canExempt = !!a.rule_id
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {a.company?.name || a.assignee?.company_name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.project?.name ?? <span className="text-gray-400 italic">All projects</span>}
                        {a.rule_id && <span className="ml-2 text-xs text-gray-400 italic">(whole project)</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.assignee?.full_name || a.assignee?.email || <span className="text-gray-400 italic">Not started</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {a.due_date ? format(new Date(a.due_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>
                          {STATUS_LABELS[a.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 justify-end">
                          {REVIEWABLE.includes(a.status) && (
                            <Link
                              to={`${basePath}/assignments/${a.id}/review`}
                              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                            >
                              Review
                            </Link>
                          )}
                          {canExempt && (
                            <button
                              onClick={() => exemptAssignment.mutate(a.id)}
                              disabled={exemptAssignment.isPending}
                              className="text-xs text-gray-500 hover:text-red-600 font-medium"
                              title="Exempt this company from the whole-project questionnaire"
                            >
                              Exempt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
