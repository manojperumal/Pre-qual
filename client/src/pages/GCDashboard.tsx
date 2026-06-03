import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useMyPrequals, useSentInvitations } from '@/hooks/usePrequals'
import { useProjects } from '@/hooks/useProjects'
import { StatusBadge } from '@/components/StatusBadge'
import { Prequalification } from '@/types'
import { Plus, Send, Eye, FileText, FolderOpen } from 'lucide-react'
import { format } from 'date-fns'

export default function GCDashboard() {
  const { profile } = useAuth()
  const { data: preqals = [], isLoading } = useMyPrequals(profile?.id)
  const { data: invitations = [] } = useSentInvitations(profile?.id)
  const { data: projects = [], isLoading: projectsLoading } = useProjects(profile?.id)

  // GC as applicant: submitted to owners
  const asApplicant = preqals.filter((p) => p.applicant_id === profile?.id)
  // GC as requester: trades they manage
  const asRequester = preqals.filter((p) => p.requester_id === profile?.id)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GC Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track your pre-qualifications and manage Trade subs
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/gc/prequal/new" className="btn-secondary">
            <FileText size={16} className="mr-2" />
            New Pre-Qual
          </Link>
          <Link to="/gc/invite" className="btn-primary">
            <Plus size={16} className="mr-2" />
            Invite Trade
          </Link>
        </div>
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
                  to={`/gc/projects/${project.id}`}
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
          { label: 'My Submissions', value: asApplicant.length, color: 'text-gray-900' },
          {
            label: 'Approved',
            value: asApplicant.filter((p) => p.status === 'approved').length,
            color: 'text-green-600',
          },
          { label: 'Trades Managed', value: asRequester.length, color: 'text-brand-600' },
          { label: 'Invites Sent', value: invitations.length, color: 'text-purple-600' },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* My pre-qualifications (as applicant for owners) */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">My Pre-Qualifications (for Owners)</h2>
          <Link to="/gc/prequal/new" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            + New
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : asApplicant.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No pre-qualifications yet</p>
            <Link to="/gc/prequal/new" className="btn-primary mt-3 inline-flex text-sm">
              Start Pre-Qual
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Requested By', 'Trade Type', 'Last Updated', 'Status', 'Actions'].map((h) => (
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
                {asApplicant.map((prequal: Prequalification & { requester: unknown }) => {
                  const requester = prequal.requester as { company_name?: string; full_name?: string } | null
                  return (
                    <tr key={prequal.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {requester?.company_name || requester?.full_name || 'Direct'}
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
                            to={`/gc/prequal/${prequal.id}`}
                            className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-brand-50 transition-colors"
                            title="View"
                          >
                            <Eye size={16} />
                          </Link>
                          {prequal.status === 'draft' && (
                            <Link
                              to={`/gc/prequal/${prequal.id}/edit`}
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

      {/* Trades managed */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Trade Pre-Qualifications</h2>
          <Link to="/gc/invite" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            + Invite Trade
          </Link>
        </div>
        {asRequester.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Send size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No trade submissions yet</p>
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
                {asRequester.map((prequal: Prequalification & { applicant: unknown }) => {
                  const applicant = prequal.applicant as { company_name?: string; full_name?: string } | null
                  return (
                    <tr key={prequal.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {prequal.company_name || applicant?.company_name || '—'}
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
                        <Link
                          to={`/gc/prequal/${prequal.id}`}
                          className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-brand-50 transition-colors inline-flex"
                          title="View"
                        >
                          <Eye size={16} />
                        </Link>
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
            <h2 className="text-base font-semibold text-gray-900">Sent Invitations</h2>
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
