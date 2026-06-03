import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useMyPrequals, useSentInvitations } from '@/hooks/usePrequals'
import { useProjects } from '@/hooks/useProjects'
import { StatusBadge } from '@/components/StatusBadge'
import { Plus, FolderOpen } from 'lucide-react'
import { format } from 'date-fns'

export default function OwnerDashboard() {
  const { profile } = useAuth()
  const { data: preqals = [] } = useMyPrequals(profile?.id)
  const { data: invitations = [] } = useSentInvitations(profile?.id)
  const { data: projects = [], isLoading: projectsLoading } = useProjects(profile?.id)

  // Owner sees prequalifications where they are the requester
  const myPrequals = preqals.filter((p) => p.requester_id === profile?.id)

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage pre-qualification requests for your projects
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Submissions', value: myPrequals.length },
          { label: 'Under Review', value: myPrequals.filter((p) => p.status === 'under_review').length, activeColor: 'text-yellow-600' },
          { label: 'Approved', value: myPrequals.filter((p) => p.status === 'approved').length, activeColor: 'text-green-600' },
          { label: 'Invites Sent', value: invitations.length, activeColor: 'text-brand-600' },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${
              stat.value > 0 && stat.activeColor ? stat.activeColor : 'text-gray-900'
            }`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* My Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">My Projects</h2>
          <Link to="/owner/projects/new" className="btn-primary text-sm py-1.5 px-3 inline-flex items-center gap-1">
            <Plus size={14} />
            New Project
          </Link>
        </div>

        {projectsLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            <FolderOpen size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm mt-1">Create a project to organize your pre-qualifications</p>
            <Link to="/owner/projects/new" className="btn-primary mt-4 inline-flex">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const memberCount = project.project_members?.[0]?.count ?? 0
              return (
                <Link
                  key={project.id}
                  to={`/owner/projects/${project.id}`}
                  className="card-hover p-5 block"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                      {project.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                    <FolderOpen size={18} className="text-brand-400 flex-shrink-0 ml-2" />
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    {memberCount} member{memberCount !== 1 ? 's' : ''}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Submissions message */}
      <div className="card px-6 py-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Pre-Qualification Submissions</h2>
        <p className="text-sm text-gray-500">View submissions by opening a project above.</p>
      </div>

      {/* Recent invitations */}
      {invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Recent Invitations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Recipient', 'Role', 'Sent', 'Status'].map((h) => (
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
                {invitations.slice(0, 10).map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{inv.recipient_email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                      {inv.recipient_role}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(new Date(inv.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inv.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
