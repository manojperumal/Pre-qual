import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useQuestionnaires, useCreateAssignment } from '@/hooks/useQuestionnaires'
import { useProjects, useCompanyProjects, useProjectMembers } from '@/hooks/useProjects'

export default function AssignQuestionnairePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { projectId: routeProjectId } = useParams()

  const isOwner = profile?.role === 'owner'
  const companyOwnerId = (profile as any)?.company_id || profile?.id

  const { data: questionnaires = [] } = useQuestionnaires(profile?.id, companyOwnerId)
  const { data: ownerProjects = [] } = useProjects(isOwner ? profile?.id : undefined)
  const { data: memberProjects = [] } = useCompanyProjects(!isOwner ? companyOwnerId : undefined)
  const projects = isOwner ? ownerProjects : memberProjects
  const createAssignment = useCreateAssignment()

  const [questionnaireId, setQuestionnaireId] = useState('')
  const [projectId, setProjectId] = useState(routeProjectId ?? '')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')

  const { data: members = [] } = useProjectMembers(projectId || undefined)

  // Owners can assign to GCs and Trades; GCs can assign to Trades only
  const assignableRoles = isOwner ? ['gc', 'trade'] : ['trade']
  const assignableMembers = members.filter((m: any) =>
    m.profile?.id !== profile?.id && assignableRoles.includes(m.profile?.role)
  )

  const basePath = isOwner ? '/owner' : '/gc'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !questionnaireId || !projectId || !assigneeId) return
    await createAssignment.mutateAsync({
      questionnaire_id: questionnaireId,
      project_id: projectId,
      assignee_id: assigneeId,
      assigned_by: profile.id,
      due_date: dueDate || undefined,
    })
    navigate(`${basePath}/questionnaires`)
  }

  return (
    <div className="p-6 max-w-xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6">
        <Link to={`${basePath}/questionnaires`} className="hover:text-gray-700">Questionnaires</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">Assign</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Assign Questionnaire</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        {/* Questionnaire */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Questionnaire *</label>
          <select
            required
            value={questionnaireId}
            onChange={e => setQuestionnaireId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select a questionnaire…</option>
            {questionnaires.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
          {questionnaires.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              No questionnaires yet.{' '}
              <Link to={`${basePath}/questionnaires/new`} className="text-brand-600 hover:underline">Create one first</Link>
            </p>
          )}
        </div>

        {/* Project */}
        {!routeProjectId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
            <select
              required
              value={projectId}
              onChange={e => { setProjectId(e.target.value); setAssigneeId('') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a project…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Assignee */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign To *</label>
          {assignableMembers.length > 0 ? (
            <select
              required
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a member…</option>
              {assignableMembers.map((m: any) => (
                <option key={m.profile?.id ?? m.id} value={m.profile?.id ?? m.id}>
                  {m.profile?.full_name || m.profile?.email || 'Unknown'}
                  {m.profile?.company_name ? ` (${m.profile.company_name})` : ''} — {m.profile?.role}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-400 italic">
              {!projectId
                ? 'Select a project first.'
                : isOwner
                ? 'No GCs or trades found on this project.'
                : 'No trades found on this project.'}
            </p>
          )}
        </div>

        {/* Due date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={createAssignment.isPending || !questionnaireId || !projectId || !assigneeId}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {createAssignment.isPending ? 'Assigning…' : 'Assign'}
          </button>
          <Link
            to={`${basePath}/questionnaires`}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
