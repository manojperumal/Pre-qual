import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjects, useMyProjects, useTeamMembers, useCompanyProjects, useUpdateMemberRole, useOwnerGCs, useOwnerTrades } from '@/hooks/useProjects'
import { useOwnerPendingSubmissions } from '@/hooks/useContractorProfile'
import { useSentInvitations, useResendInvitation } from '@/hooks/usePrequals'
import { FolderOpen, HardHat, Wrench, ClipboardList, AlertTriangle, ChevronRight, Plus, Users, RefreshCw } from 'lucide-react'
import { roleLabel } from '@/lib/roleLabels'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
  draft: 'bg-gray-100 text-gray-600',
}

export default function OwnerDashboard() {
  const { profile } = useAuth()
  const isTeamMember = !!(profile as any)?.company_id
  const memberRole: 'admin' | 'contributor' = (profile as any)?.member_role ?? 'admin'
  const companyOwnerId = (profile as any)?.company_id || profile?.id

  const { data: companyProjects = [], isLoading: companyLoading } = useCompanyProjects(
    isTeamMember && memberRole === 'admin' ? companyOwnerId : undefined
  )
  const { data: memberProjects = [], isLoading: memberProjectsLoading } = useMyProjects(
    (isTeamMember && memberRole === 'contributor') ? profile?.id : undefined
  )
  const { data: allProjects = [], isLoading: allProjectsLoading } = useProjects(isTeamMember ? undefined : profile?.id)
  const projects = isTeamMember ? (memberRole === 'admin' ? companyProjects : memberProjects) : allProjects
  const projectsLoading = isTeamMember ? (memberRole === 'admin' ? companyLoading : memberProjectsLoading) : allProjectsLoading

  const { data: gcs = [] } = useOwnerGCs(companyOwnerId)
  const { data: trades = [] } = useOwnerTrades(companyOwnerId)
  const { data: pending = [], isLoading: pendingLoading } = useOwnerPendingSubmissions(companyOwnerId)
  const { data: teamMembers = [] } = useTeamMembers(isTeamMember ? undefined : profile?.id)
  const updateMemberRole = useUpdateMemberRole()
  const { data: invitations = [] } = useSentInvitations(companyOwnerId)
  const resendInvitation = useResendInvitation()

  const uniqueGCs = new Set(gcs.map((r) => r.contractorId)).size
  const uniqueTrades = new Set(trades.map((r) => r.contractorId)).size

  const stats = [
    { label: 'Active Projects', value: projects.length, icon: <FolderOpen size={20} />, color: 'text-brand-600', bg: 'bg-brand-50', to: '/owner/projects' },
    { label: 'General Contractors', value: uniqueGCs, icon: <HardHat size={20} />, color: 'text-indigo-600', bg: 'bg-indigo-50', to: '/owner/general-contractors' },
    { label: 'Trades', value: uniqueTrades, icon: <Wrench size={20} />, color: 'text-purple-600', bg: 'bg-purple-50', to: '/owner/trades' },
    { label: 'Pending Reviews', value: pending.length, icon: <ClipboardList size={20} />, color: pending.length > 0 ? 'text-amber-600' : 'text-gray-500', bg: pending.length > 0 ? 'bg-amber-50' : 'bg-gray-50', to: null },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back, {profile?.full_name || 'Owner'}</p>
        </div>
        <div className="flex gap-2">
          {!isTeamMember && (
            <Link to="/owner/invite?role=owner_member&from=owner-dashboard" className="btn-secondary inline-flex items-center gap-2 text-sm">
              <Plus size={16} />
              Invite Team Member
            </Link>
          )}
          <Link to="/owner/projects/new" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus size={16} />
            New Project
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const inner = (
            <div className={`card px-5 py-4 flex items-center gap-4 ${s.to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <span className={s.color}>{s.icon}</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            </div>
          )
          return s.to ? (
            <Link key={s.label} to={s.to}>{inner}</Link>
          ) : (
            <div key={s.label}>{inner}</div>
          )
        })}
      </div>

      {/* Pending reviews */}
      {(pending.length > 0 || pendingLoading) && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900">Needs Review</h2>
            {pending.length > 0 && (
              <span className="ml-auto bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {pending.length} pending
              </span>
            )}
          </div>
          {pendingLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pending.map((sub) => (
                <div key={sub.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {sub.contractor?.full_name || sub.contractor?.email || '—'}
                      {sub.contractor?.company_name && (
                        <span className="text-gray-500 font-normal"> · {sub.contractor.company_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{sub.project_name}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {(sub.flagged_no_ptp || sub.flagged_high_emr) && (
                      <AlertTriangle size={14} className="text-red-500" title="Risk flags present" />
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sub.status]}`}>
                      {sub.status.replace(/_/g, ' ')}
                    </span>
                    <Link
                      to={`/owner/projects/${sub.project_id}/submissions/${sub.id}`}
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Review <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
          <Link to="/owner/projects" className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1">
            View all <ChevronRight size={14} />
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
            <p className="text-sm mt-1">Create a project to start managing pre-qualifications</p>
            <Link to="/owner/projects/new" className="btn-primary mt-4 inline-flex items-center gap-2">
              <Plus size={16} />
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((project) => {
              const memberCount = project.project_members?.[0]?.count ?? 0
              return (
                <Link key={project.id} to={`/owner/projects/${project.id}`} className="card-hover p-5 block">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                      {project.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                    <FolderOpen size={18} className="text-brand-400 flex-shrink-0 ml-2 mt-0.5" />
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-gray-400">{memberCount} member{memberCount !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-gray-400">{format(new Date(project.created_at), 'MMM d, yyyy')}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
      {/* Team Members — only for company owners */}
      {!isTeamMember && (teamMembers as any[]).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">My Team</h2>
            <Link
              to="/owner/invite?role=owner_member&from=owner-dashboard"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
            >
              + Invite Team Member
            </Link>
          </div>
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Email', 'Access Level', 'Joined'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(teamMembers as any[]).map((m: any) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{m.full_name || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{m.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={m.member_role ?? 'contributor'}
                        onChange={e => updateMemberRole.mutate({ userId: m.id, memberRole: e.target.value as 'admin' | 'contributor' })}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="admin">Admin — all projects</option>
                        <option value="contributor">Contributor — assigned only</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(m.created_at), 'MMM d, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sent invitations */}
      {invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Invitations Sent</h2>
            <Link to="/owner/invite?role=gc" className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1">
<<<<<<< HEAD
              + Invite General Contractor
=======
              + Invite GC
>>>>>>> origin/main
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Recipient', 'Role', 'Sent', 'Status', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invitations.slice(0, 10).map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{inv.recipient_email}</td>
<<<<<<< HEAD
                    <td className="px-6 py-4 text-sm text-gray-600">{roleLabel(inv.recipient_role)}</td>
=======
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{inv.recipient_role}</td>
>>>>>>> origin/main
                    <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(inv.created_at), 'MMM d, yyyy')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        inv.status === 'expired' ? 'bg-gray-100 text-gray-500' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {inv.status !== 'accepted' && (
                        <button
                          onClick={() => resendInvitation.mutate(inv.id)}
                          disabled={resendInvitation.isPending}
                          className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={resendInvitation.isPending ? 'animate-spin' : ''} />
                          Resend
                        </button>
                      )}
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
