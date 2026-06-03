import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useMyPrequals, useReceivedInvitations } from '@/hooks/usePrequals'
import { useProjects } from '@/hooks/useProjects'
import { StatusBadge } from '@/components/StatusBadge'
import { Prequalification } from '@/types'
import { FileText, Mail, Eye, Clock, FolderOpen } from 'lucide-react'
import { format } from 'date-fns'

export default function TradeDashboard() {
  const { profile } = useAuth()
  const { data: preqals = [], isLoading } = useMyPrequals(profile?.id)
  const { data: invitations = [] } = useReceivedInvitations(profile?.email ?? undefined)
  const { data: projects = [], isLoading: projectsLoading } = useProjects(profile?.id)

  // Trade is always the applicant
  const myPrequals = preqals.filter((p) => p.applicant_id === profile?.id)
  const pendingInvites = invitations.filter((i) => i.status === 'pending')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trade Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your pre-qualification submissions
          </p>
        </div>
        <Link to="/trade/prequal/new" className="btn-primary">
          <FileText size={16} className="mr-2" />
          New Pre-Qual
        </Link>
      </div>

      {/* My Projects */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Projects</h2>
        {projectsLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            <FolderOpen size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No projects yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const memberCount = project.project_members?.[0]?.count ?? 0
              return (
                <Link
                  key={project.id}
                  to={`/trade/projects/${project.id}`}
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
        {[
          { label: 'Submissions', value: myPrequals.length, color: 'text-gray-900' },
          {
            label: 'Approved',
            value: myPrequals.filter((p) => p.status === 'approved').length,
            color: 'text-green-600',
          },
          {
            label: 'Under Review',
            value: myPrequals.filter((p) => p.status === 'under_review').length,
            color: 'text-yellow-600',
          },
          {
            label: 'Pending Invites',
            value: pendingInvites.length,
            color: 'text-blue-600',
          },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Pending invitations alert */}
      {pendingInvites.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={18} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-blue-800">
              You have {pendingInvites.length} pending pre-qualification request
              {pendingInvites.length > 1 ? 's' : ''}
            </h3>
          </div>
          <ul className="space-y-1">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="text-sm text-blue-700 flex items-center gap-2">
                <Clock size={12} />
                Invited by {inv.sender_id} — {format(new Date(inv.created_at), 'MMM d, yyyy')}
                <Link to="/trade/prequal/new" className="ml-2 underline font-medium">
                  Respond
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pre-qualifications */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">My Pre-Qualifications</h2>
          <Link to="/trade/prequal/new" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            + New
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : myPrequals.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <FileText size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No pre-qualifications yet</p>
            <p className="text-sm mt-1">Start a new pre-qualification to get approved</p>
            <Link to="/trade/prequal/new" className="btn-primary mt-4 inline-flex">
              Start Pre-Qual
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Requester', 'Trade Type', 'Last Updated', 'Status', 'Actions'].map((h) => (
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
                {myPrequals.map((prequal: Prequalification & { requester: unknown }) => {
                  const requester = prequal.requester as { company_name?: string; full_name?: string } | null
                  return (
                    <tr key={prequal.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {requester?.company_name || requester?.full_name || 'Self-initiated'}
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
                            to={`/trade/prequal/${prequal.id}`}
                            className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-brand-50 transition-colors"
                            title="View"
                          >
                            <Eye size={16} />
                          </Link>
                          {prequal.status === 'draft' && (
                            <Link
                              to={`/trade/prequal/${prequal.id}/edit`}
                              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                            >
                              Edit
                            </Link>
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

      {/* Received invitations history */}
      {invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Received Invitations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['From', 'Received', 'Status'].map((h) => (
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
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{inv.sender_id}</td>
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
