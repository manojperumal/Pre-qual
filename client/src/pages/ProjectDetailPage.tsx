import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjectMembers } from '@/hooks/useProjects'
import { useProjects } from '@/hooks/useProjects'
import { Users, UserPlus } from 'lucide-react'
import { format } from 'date-fns'

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { profile } = useAuth()
  const { data: projects = [] } = useProjects(profile?.id)
  const { data: members = [], isLoading } = useProjectMembers(projectId)

  const project = projects.find((p) => p.id === projectId)

  const role = profile?.role ?? 'owner'
  const dashPath = role === 'owner' ? '/owner' : role === 'gc' ? '/gc' : '/trade'
  const invitePath = `/${role}/projects/${projectId}/invite`

  return (
    <div className="space-y-6">
      <div>
        <Link to={dashPath} className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to Dashboard
        </Link>
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
                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {p?.full_name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {p?.company_name || '—'}
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
    </div>
  )
}
