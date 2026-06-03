import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjectMembers } from '@/hooks/useProjects'
import { useProjects } from '@/hooks/useProjects'
import { useProjectSubmissions } from '@/hooks/useContractorProfile'
import { Users, UserPlus, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

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
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { profile } = useAuth()
  const { data: projects = [] } = useProjects(profile?.id)
  const { data: members = [], isLoading } = useProjectMembers(projectId)
  const { data: submissions = [], isLoading: subsLoading } = useProjectSubmissions(projectId)

  const project = projects.find((p) => p.id === projectId)

  const role = profile?.role ?? 'owner'
  const projectsListPath = role === 'owner' ? '/owner/projects' : role === 'gc' ? '/gc' : '/trade'
  const invitePath = `/${role}/projects/${projectId}/invite`
  const submissionBasePath = role === 'gc' ? `/gc/projects/${projectId}/submissions` : `/owner/projects/${projectId}/submissions`

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to={projectsListPath} className="hover:text-brand-600 transition-colors">
          Projects
        </Link>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-medium truncate">
          {project?.name ?? 'Project'}
        </span>
      </nav>

      <div>
        {project ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-sm text-gray-500">{project.description}</p>
            )}
          </>
        ) : (
          <h1 className="text-2xl font-bold text-gray-900">Project</h1>
        )}
      </div>

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
              <Link to={invitePath} className="btn-primary mt-3 inline-flex text-sm">
                Invite someone
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Company', 'Role', 'Joined'].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
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
                          <span className="text-gray-400 italic">Profile incomplete</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                        {member.role}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {format(new Date(member.joined_at), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submissions section — visible to owner and gc */}
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
                    {['Contractor', 'Company', 'Status', 'Submitted', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {sub.contractor?.full_name || sub.contractor?.email || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {sub.contractor?.company_name ? (
                          <span className="text-gray-600">{sub.contractor.company_name}</span>
                        ) : (
                          <span className="text-gray-400 italic">Profile incomplete</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SUBMISSION_STATUS_COLORS[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {sub.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {format(new Date(sub.updated_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`${submissionBasePath}/${sub.id}`}
                          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                        >
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
