import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTeamMembers, useUpdateMemberRole } from '@/hooks/useProjects'
import { Users } from 'lucide-react'
import { format } from 'date-fns'

const INVITE_ROLE: Record<string, string> = {
  gc: 'gc_member',
  trade: 'trade_member',
  owner: 'owner_member',
}

export default function MyTeamPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const basePath = '/' + location.pathname.split('/')[1]
  const inviteRole = INVITE_ROLE[basePath.slice(1)] ?? 'gc_member'

  const companyId = profile?.new_company_id ?? (profile as any)?.company_id ?? null
  const isTeamMember = profile?.user_role === 'contributor'

  const { data: teamMembers = [], isLoading } = useTeamMembers(!isTeamMember ? (companyId ?? undefined) : undefined)
  const updateMemberRole = useUpdateMemberRole()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Team</h1>
          <p className="mt-1 text-sm text-gray-500">Everyone on your company's account</p>
        </div>
        {!isTeamMember && (
          <Link
            to={`${basePath}/invite?role=${inviteRole}&from=my-team`}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            + Invite Team Member
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : isTeamMember ? (
        <div className="card p-8 text-center text-gray-500">
          <Users size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Only company admins can view the team list</p>
        </div>
      ) : teamMembers.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <Users size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No team members yet</p>
          <p className="text-sm mt-1">Invite colleagues to join your company on the platform</p>
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
                      value={m.user_role ?? m.member_role ?? 'contributor'}
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
  )
}
