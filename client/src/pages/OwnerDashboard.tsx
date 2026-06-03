import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useMyPrequals, useSentInvitations, useUpdatePrequalStatus } from '@/hooks/usePrequals'
import { useProjects } from '@/hooks/useProjects'
import { StatusBadge } from '@/components/StatusBadge'
import { PrequalStatus, Prequalification } from '@/types'
import { Plus, Send, Eye, CheckCircle, XCircle, RefreshCw, FolderOpen } from 'lucide-react'
import { format } from 'date-fns'

export default function OwnerDashboard() {
  const { profile } = useAuth()
  const { data: preqals = [], isLoading } = useMyPrequals(profile?.id)
  const { data: invitations = [] } = useSentInvitations(profile?.id)
  const { data: projects = [], isLoading: projectsLoading } = useProjects(profile?.id)
  const updateStatus = useUpdatePrequalStatus()

  // Owner sees prequalifications where they are the requester
  const myPrequals = preqals.filter((p) => p.requester_id === profile?.id)

  function handleStatusChange(id: string, status: PrequalStatus) {
    updateStatus.mutate({ id, status })
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage pre-qualification requests for your projects
          </p>
        </div>
        <Link to="/owner/invite" className="btn-primary">
          <Plus size={16} className="mr-2" />
          Invite GC / Trade
        </Link>
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
                  className="card p-5 hover:shadow-md transition-shadow block"
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(
          [
            { label: 'Total Submissions', value: myPrequals.length, color: 'text-gray-900' },
            {
              label: 'Under Review',
              value: myPrequals.filter((p) => p.status === 'under_review').length,
              color: 'text-yellow-600',
            },
            {
              label: 'Approved',
              value: myPrequals.filter((p) => p.status === 'approved').length,
              color: 'text-green-600',
            },
            {
              label: 'Invites Sent',
              value: invitations.length,
              color: 'text-brand-600',
            },
          ] as const
        ).map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Pre-qualifications table */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Pre-Qualification Submissions</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : myPrequals.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Send size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No submissions yet</p>
            <p className="text-sm mt-1">Invite a GC or Trade to get started</p>
            <Link to="/owner/invite" className="btn-primary mt-4 inline-flex">
              Send Invite
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Company', 'Trade Type', 'Submitted', 'Status', 'Actions'].map((h) => (
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
                {myPrequals.map((prequal: Prequalification & { applicant: unknown }) => {
                  const applicant = prequal.applicant as { company_name?: string; full_name?: string } | null
                  return (
                    <tr key={prequal.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {prequal.company_name || applicant?.company_name || '—'}
                          </p>
                          <p className="text-xs text-gray-500">{applicant?.full_name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {prequal.trade_type || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {format(new Date(prequal.updated_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={prequal.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/owner/prequal/${prequal.id}`}
                            className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-brand-50 transition-colors"
                            title="View details"
                          >
                            <Eye size={16} />
                          </Link>
                          {prequal.status === 'submitted' && (
                            <button
                              onClick={() => handleStatusChange(prequal.id, 'under_review')}
                              className="p-1.5 text-gray-400 hover:text-yellow-600 rounded hover:bg-yellow-50 transition-colors"
                              title="Mark under review"
                            >
                              <RefreshCw size={16} />
                            </button>
                          )}
                          {(prequal.status === 'submitted' || prequal.status === 'under_review') && (
                            <>
                              <button
                                onClick={() => handleStatusChange(prequal.id, 'approved')}
                                className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50 transition-colors"
                                title="Approve"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                onClick={() => handleStatusChange(prequal.id, 'rejected')}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                title="Reject"
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
