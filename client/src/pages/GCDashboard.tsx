import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjects, useMyProjects, useTeamMembers, useCompanyProjects, useUpdateMemberRole } from '@/hooks/useProjects'
import { useContractorProfile, useProjectSubmission } from '@/hooks/useContractorProfile'
import { useSentInvitations, useSendInvitation } from '@/hooks/usePrequals'
import { useMyAssignments } from '@/hooks/useQuestionnaires'
import { FolderOpen, User, Send, UserPlus, CheckCircle, Clock, AlertCircle, ClipboardList, Users, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { roleLabel } from '@/lib/roleLabels'

const SUBMISSION_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

function SubmissionStatusIcon({ status }: { status: string | undefined }) {
  if (status === 'approved') return <CheckCircle size={14} className="text-green-500" />
  if (status === 'under_review' || status === 'submitted') return <Clock size={14} className="text-yellow-500" />
  if (status === 'rejected') return <AlertCircle size={14} className="text-red-500" />
  return null
}

function ProjectCard({ project, userId }: { project: any; userId: string }) {
  const { data: submission } = useProjectSubmission(project.id, userId)
  const memberCount = project.project_members?.[0]?.count ?? 0

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link to={`/gc/projects/${project.id}`} className="font-semibold text-gray-900 hover:text-brand-600 truncate block">
            {project.name}
          </Link>
          {project.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{project.description}</p>
          )}
        </div>
        <FolderOpen size={16} className="text-brand-400 flex-shrink-0 mt-0.5" />
      </div>

      {(project.start_date || project.end_date) && (
        <p className="text-xs text-gray-400 mt-2">
          {project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—'}
          {' → '}
          {project.end_date ? format(new Date(project.end_date), 'MMM d, yyyy') : '—'}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1">{memberCount} member{memberCount !== 1 ? 's' : ''}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        {submission ? (
          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${SUBMISSION_COLORS[submission.status] ?? 'bg-gray-100 text-gray-600'}`}>
            <SubmissionStatusIcon status={submission.status} />
            {submission.status.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-xs text-gray-400">No submission yet</span>
        )}
        <Link
          to={`/gc/projects/${project.id}/submit`}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Send size={12} />
          {submission ? 'Update' : 'Submit Pre-Qual'}
        </Link>
      </div>
    </div>
  )
}

export default function GCDashboard() {
  const { profile } = useAuth()

  // If this GC is a team member (has company_id), scope to their project_members only
  const isTeamMember = !!(profile as any)?.company_id
  const memberRole: 'admin' | 'contributor' = (profile as any)?.member_role ?? 'admin'
  const companyOwnerId = (profile as any)?.company_id || profile?.id

  const { data: companyProjects = [], isLoading: companyLoading } = useCompanyProjects(
    isTeamMember && memberRole === 'admin' ? companyOwnerId : undefined
  )
  const { data: memberProjects = [], isLoading: memberProjectsLoading } = useMyProjects(
    (isTeamMember && memberRole === 'contributor') ? profile?.id : undefined
  )
  const { data: allProjects = [], isLoading: allProjectsLoading } = useProjects(
    !isTeamMember ? profile?.id : undefined
  )
  const { data: invitations = [] } = useSentInvitations(companyOwnerId)
  const resendInvitation = useSendInvitation()
  const { data: contractorProfile } = useContractorProfile(profile?.id)
  const { data: myAssignments = [] } = useMyAssignments(profile?.id)
  const { data: teamMembers = [] } = useTeamMembers(isTeamMember ? undefined : profile?.id)
  const updateMemberRole = useUpdateMemberRole()

  const projectsLoading = isTeamMember
    ? (memberRole === 'admin' ? companyLoading : memberProjectsLoading)
    : allProjectsLoading
  const profileComplete = !!(contractorProfile?.company_name && contractorProfile?.gl_carrier)
  const myProjects = isTeamMember
    ? (memberRole === 'admin' ? companyProjects : memberProjects)
    : allProjects.filter((p) => p.owner_id !== profile?.id)

  // Derive quick stats from projects
  const approvedCount = 0 // would need submissions query — keep simple for now
  const pendingInvites = invitations.filter((i) => i.status === 'pending').length
  const pendingQuestionnaires = myAssignments.filter((a) =>
    ['pending', 'in_progress', 'needs_more_info'].includes(a.status)
  ).length

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back, {profile?.full_name || profile?.company_name || 'GC'}</p>
        </div>
        <div className="flex gap-2">
          {!isTeamMember && (
            <Link
              to="/gc/invite?role=gc_member&from=gc-dashboard"
              className="btn-secondary inline-flex items-center gap-2 text-sm"
            >
              <Users size={16} />
              Invite Team Member
            </Link>
          )}
          <Link
            to="/gc/invite?role=trade&from=gc-dashboard"
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            <UserPlus size={16} />
            Invite Trade
          </Link>
        </div>
      </div>

      {/* Profile completeness banner */}
      <div className={`card p-5 flex items-center justify-between ${!profileComplete ? 'border-amber-200 bg-amber-50' : ''}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${profileComplete ? 'bg-green-100' : 'bg-amber-100'}`}>
            <User size={20} className={profileComplete ? 'text-green-600' : 'text-amber-600'} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">My Contractor Profile</p>
            <p className={`text-xs mt-0.5 ${profileComplete ? 'text-green-600' : 'text-amber-600'}`}>
              {profileComplete ? 'Complete — ready to submit pre-quals' : 'Incomplete — complete your profile before submitting'}
            </p>
          </div>
        </div>
        <Link to="/gc/profile" className="btn-secondary text-sm">
          {profileComplete ? 'Edit Profile' : 'Complete Profile →'}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Projects', value: myProjects.length, color: 'text-brand-600', bg: 'bg-brand-50', icon: <FolderOpen size={18} />, to: undefined },
          { label: 'Trades Invited', value: invitations.filter((i) => i.recipient_role === 'trade').length, color: 'text-purple-600', bg: 'bg-purple-50', icon: <UserPlus size={18} />, to: undefined },
          { label: 'Pending Invites', value: pendingInvites, color: pendingInvites > 0 ? 'text-amber-600' : 'text-gray-500', bg: pendingInvites > 0 ? 'bg-amber-50' : 'bg-gray-50', icon: <Clock size={18} />, to: undefined },
          { label: 'Pending Questionnaires', value: pendingQuestionnaires, color: pendingQuestionnaires > 0 ? 'text-blue-600' : 'text-gray-500', bg: pendingQuestionnaires > 0 ? 'bg-blue-50' : 'bg-gray-50', icon: <ClipboardList size={18} />, to: '/gc/assignments' },
        ].map((s) => {
          const inner = (
            <>
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <span className={s.color}>{s.icon}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </>
          )
          return s.to ? (
            <Link key={s.label} to={s.to} className="card px-5 py-4 flex items-center gap-3 hover:shadow-md transition-shadow">
              {inner}
            </Link>
          ) : (
            <div key={s.label} className="card px-5 py-4 flex items-center gap-3">
              {inner}
            </div>
          )
        })}
      </div>

      {/* My Projects */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Projects</h2>
        {projectsLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : myProjects.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            <FolderOpen size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm mt-1">Accept an invitation from an Owner to join a project</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myProjects.map((project) => (
              <ProjectCard key={project.id} project={project} userId={profile?.id ?? ''} />
            ))}
          </div>
        )}
      </div>

      {/* Team Members — only shown for company owners (not team members themselves) */}
      {!isTeamMember && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">My Team</h2>
            <Link
              to="/gc/invite?role=gc_member&from=gc-dashboard"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
            >
              + Invite Team Member
            </Link>
          </div>
          {teamMembers.length === 0 ? (
            <div className="card p-6 text-center text-gray-500">
              <Users size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No team members yet</p>
              <p className="text-xs text-gray-400 mt-1">Invite colleagues to join your company on the platform</p>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {/* Sent invitations */}
      {invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Invitations Sent</h2>
            <Link to="/gc/invite?role=trade" className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1">
              + Invite Trade
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
                    <td className="px-6 py-4 text-sm text-gray-600">{roleLabel(inv.recipient_role)}</td>
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
                          onClick={() => resendInvitation.mutate({
                            recipient_email: inv.recipient_email,
                            recipient_role: inv.recipient_role as any,
                            project_id: inv.project_id ?? undefined,
                          })}
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
