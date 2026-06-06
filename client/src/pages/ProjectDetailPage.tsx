import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjectMembers, useUpdateProject, useSetProjectPrimaryContact } from '@/hooks/useProjects'
import { useProjects } from '@/hooks/useProjects'
import { useProjectSubmissions } from '@/hooks/useContractorProfile'
import { useProjectAssignments, AssignmentStatus } from '@/hooks/useQuestionnaires'
import { Users, UserPlus, ChevronRight, Pencil, X, Check, Calendar, ClipboardList, Star } from 'lucide-react'
import { format } from 'date-fns'
import { useForm } from 'react-hook-form'

const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

function getInitials(name?: string | null): string {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')
}

function fmt(d: string | null | undefined) {
  if (!d) return null
  return format(new Date(d), 'MMM d, yyyy')
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { profile } = useAuth()
  const { data: projects = [] } = useProjects(profile?.id)
  const { data: members = [], isLoading } = useProjectMembers(projectId)
  const { data: submissions = [], isLoading: subsLoading } = useProjectSubmissions(projectId)
  const { data: projectAssignments = [] } = useProjectAssignments(projectId)
  const updateProject = useUpdateProject()
  const setPrimaryContact = useSetProjectPrimaryContact()

  const [editing, setEditing] = useState(false)

  const project = projects.find((p) => p.id === projectId)

  const role = profile?.role ?? 'owner'
  const projectsListPath = role === 'owner' ? '/owner/projects' : role === 'gc' ? '/gc' : '/trade'
  const invitePath = `/${role}/projects/${projectId}/invite`
  const submissionBasePath = role === 'gc' ? `/gc/projects/${projectId}/submissions` : `/owner/projects/${projectId}/submissions`

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      start_date: project?.start_date ?? '',
      end_date: project?.end_date ?? '',
    },
  })

  // Sync form when project loads
  const [synced, setSynced] = useState(false)
  if (project && !synced) {
    reset({
      name: project.name,
      description: project.description ?? '',
      start_date: project.start_date ?? '',
      end_date: project.end_date ?? '',
    })
    setSynced(true)
  }

  async function onSave(data: any) {
    if (!projectId) return
    await updateProject.mutateAsync({
      id: projectId,
      name: data.name,
      description: data.description,
      startDate: data.start_date,
      endDate: data.end_date,
    })
    setEditing(false)
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to={projectsListPath} className="hover:text-brand-600 transition-colors">Projects</Link>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-medium truncate">{project?.name ?? 'Project'}</span>
      </nav>

      {/* Project header / edit form */}
      {editing ? (
        <form onSubmit={handleSubmit(onSave)} className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Edit Project</h2>
            <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className="label">Project Name *</label>
            <input type="text" className="input-field" {...register('name', { required: true })} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea rows={2} className="input-field resize-none" {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input-field" {...register('start_date')} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input-field" {...register('end_date')} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateProject.isPending} className="btn-primary inline-flex items-center gap-1.5">
              <Check size={14} />
              {updateProject.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project?.name ?? 'Project'}</h1>
            {project?.description && <p className="mt-1 text-sm text-gray-500">{project.description}</p>}
            {(project?.start_date || project?.end_date) && (
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={13} className="text-gray-400" />
                  {fmt(project.start_date) ?? '—'}
                  {' → '}
                  {fmt(project.end_date) ?? '—'}
                </span>
              </div>
            )}
          </div>
          {role === 'owner' && (
            <button
              onClick={() => setEditing(true)}
              className="btn-secondary inline-flex items-center gap-1.5 text-sm flex-shrink-0"
            >
              <Pencil size={14} />
              Edit
            </button>
          )}
        </div>
      )}

      {/* Primary Contacts */}
      {(role === 'owner' || role === 'gc') && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Star size={16} className="text-amber-400" />
            <h2 className="text-base font-semibold text-gray-900">Primary Contacts</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* GC Primary Contact */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">GC Primary Contact</label>
              {(role === 'owner' || role === 'gc') ? (
                <select
                  value={(project as any)?.gc_primary_contact_id ?? ''}
                  onChange={e => {
                    if (!projectId) return
                    setPrimaryContact.mutate({
                      projectId,
                      field: 'gc_primary_contact_id',
                      userId: e.target.value || null,
                    })
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— Not assigned —</option>
                  {(members as any[])
                    .filter((m: any) => m.profile?.role === 'gc')
                    .map((m: any) => (
                      <option key={m.profile?.id} value={m.profile?.id}>
                        {m.profile?.full_name || m.profile?.email}
                        {m.profile?.company_name ? ` (${m.profile.company_name})` : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <p className="text-sm text-gray-700">
                  {(project as any)?.gc_contact?.full_name || (project as any)?.gc_contact?.email || <span className="text-gray-400 italic">Not assigned</span>}
                </p>
              )}
            </div>

            {/* Trade Primary Contact */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Trade Primary Contact</label>
              {(role === 'owner' || role === 'gc') ? (
                <select
                  value={(project as any)?.trade_primary_contact_id ?? ''}
                  onChange={e => {
                    if (!projectId) return
                    setPrimaryContact.mutate({
                      projectId,
                      field: 'trade_primary_contact_id',
                      userId: e.target.value || null,
                    })
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— Not assigned —</option>
                  {(members as any[])
                    .filter((m: any) => m.profile?.role === 'trade')
                    .map((m: any) => (
                      <option key={m.profile?.id} value={m.profile?.id}>
                        {m.profile?.full_name || m.profile?.email}
                        {m.profile?.company_name ? ` (${m.profile.company_name})` : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <p className="text-sm text-gray-700">
                  {(project as any)?.trade_contact?.full_name || (project as any)?.trade_contact?.email || <span className="text-gray-400 italic">Not assigned</span>}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Members</h2>
          </div>
          {role === 'owner' && (
            <Link to={invitePath} className="btn-primary text-sm py-1.5 px-3 inline-flex items-center gap-1">
              <UserPlus size={14} />
              Invite Member
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No members yet</p>
            {role === 'owner' && (
              <Link to={invitePath} className="btn-primary mt-3 inline-flex text-sm">Invite someone</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Company', 'Role', 'Joined'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {members.map((member: any) => {
                  const p = member.profile
                  const displayName = p?.full_name || p?.email || '—'
                  const initials = getInitials(p?.full_name || p?.email)
                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-700 text-xs font-bold">{initials}</span>
                          </div>
                          <span className="text-sm text-gray-900">{displayName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {p?.company_name ? (
                          <span className="text-gray-600">{p.company_name}</span>
                        ) : (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">{member.role}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(member.joined_at), 'MMM d, yyyy')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Questionnaire Assignments */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Questionnaire Assignments</h2>
          </div>
          {(role === 'owner' || role === 'gc') && (
            <Link
              to={`/${role}/questionnaires/assign`}
              className="btn-primary text-sm py-1.5 px-3 inline-flex items-center gap-1"
            >
              <ClipboardList size={14} />
              Assign Questionnaire
            </Link>
          )}
        </div>
        {projectAssignments.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <p className="text-sm">No questionnaires assigned yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Questionnaire', 'Assigned To', 'Due Date', 'Status', 'Action'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {projectAssignments.map((a) => {
                  const reviewable: AssignmentStatus[] = ['submitted', 'approved', 'rejected']
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{a.questionnaire?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.assignee?.company_name || a.assignee?.full_name || a.assignee?.email || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {a.due_date ? format(new Date(a.due_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status === 'pending' ? 'bg-gray-100 text-gray-600' :
                          a.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          a.status === 'submitted' ? 'bg-amber-100 text-amber-700' :
                          a.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          a.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {a.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {reviewable.includes(a.status) && (
                          <Link
                            to={`/${role}/assignments/${a.id}/review`}
                            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                          >
                            Review
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

      {/* Submissions */}
      {(role === 'owner' || role === 'gc') && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Pre-Qual Submissions</h2>
          </div>
          {subsLoading ? (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-sm">No submissions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Contractor', 'Company', 'Status', 'Updated', 'Actions'].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{sub.contractor?.full_name || sub.contractor?.email || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{sub.contractor?.company_name || <span className="text-gray-400 italic">—</span>}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SUBMISSION_STATUS_COLORS[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {sub.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(sub.updated_at), 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4">
                        <Link to={`${submissionBasePath}/${sub.id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
