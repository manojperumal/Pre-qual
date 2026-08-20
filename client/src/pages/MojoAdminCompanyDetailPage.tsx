import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOwnerGCs, useOwnerTrades, useGCTrades } from '@/hooks/useProjects'
import { isValidDomoEmbedUrl } from '@/lib/domoEmbed'
import { Company } from '@/types'
import { ArrowLeft, Users, HardHat, Wrench, ClipboardList, CheckCircle, Clock, LayoutDashboard } from 'lucide-react'
import { format } from 'date-fns'

const ANSWERED_STATUSES = ['submitted', 'approved', 'rejected', 'needs_more_info']
const UNANSWERED_STATUSES = ['pending', 'in_progress']

function useCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ['mojo_admin_company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', companyId!).single()
      if (error) throw error
      return data as Company
    },
  })
}

// The company's admin user — needed as the "acting user" for hooks that
// derive ecosystem data from project ownership/membership (useOwnerGCs etc).
function useCompanyAdminUser(companyId: string | undefined) {
  return useQuery({
    queryKey: ['mojo_admin_company_admin_user', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('new_company_id', companyId!)
        .eq('user_role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; full_name: string | null; email: string | null } | null
    },
  })
}

function useTeamMembers(companyId: string | undefined) {
  return useQuery({
    queryKey: ['mojo_admin_company_team', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, user_role, created_at')
        .eq('new_company_id', companyId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as { id: string; full_name: string | null; email: string | null; user_role: string; created_at: string }[]
    },
  })
}

function useAssignmentStats(companyId: string | undefined) {
  return useQuery({
    queryKey: ['mojo_admin_company_assignments', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('id, status, questionnaire:questionnaires(name), created_at')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as { id: string; status: string; questionnaire: { name: string } | null; created_at: string }[]
    },
  })
}

function useSetDomoEmbedUrl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ companyId, url }: { companyId: string; url: string | null }) => {
      const { error } = await supabase.from('companies').update({ domo_embed_url: url }).eq('id', companyId)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mojo_admin_company', vars.companyId] }),
  })
}

function DomoDashboardCard({ company }: { company: Company }) {
  const [url, setUrl] = useState(company.domo_embed_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const setDomoEmbedUrl = useSetDomoEmbedUrl()

  function handleSave() {
    setError(null)
    if (url.trim() && !isValidDomoEmbedUrl(url.trim())) {
      setError('Must be a public Domo embed URL (https://*.domo.com/...)')
      return
    }
    setDomoEmbedUrl.mutate({ companyId: company.id, url: url.trim() || null })
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <LayoutDashboard size={18} className="text-brand-600" />
        <h2 className="text-base font-semibold text-gray-900">Domo Dashboard</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Paste a public Domo dashboard embed URL to show it on this Owner's home page. Leave blank to remove it.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://public.domo.com/embed/..."
          className="input-field flex-1"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={setDomoEmbedUrl.isPending}
          className="btn-primary text-sm px-4"
        >
          {setDomoEmbedUrl.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {setDomoEmbedUrl.isError && <p className="text-sm text-red-600 mt-2">Failed to save. Please try again.</p>}
      {setDomoEmbedUrl.isSuccess && !error && <p className="text-sm text-emerald-600 mt-2">Saved.</p>}
    </div>
  )
}

function StatTile({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="card px-5 py-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  )
}

export default function MojoAdminCompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: company, isLoading: companyLoading } = useCompany(companyId)
  const { data: adminUser } = useCompanyAdminUser(companyId)
  const { data: teamMembers = [], isLoading: teamLoading } = useTeamMembers(companyId)
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignmentStats(companyId)

  const isOwner = company?.type === 'owner'
  const isGC = company?.type === 'gc'

  const { data: ownerGcRows = [] } = useOwnerGCs(isOwner ? adminUser?.id : undefined)
  const { data: ownerTradeRows = [] } = useOwnerTrades(isOwner ? adminUser?.id : undefined)
  const { data: gcTradeRows = [] } = useGCTrades(isGC ? adminUser?.id : undefined)

  const uniqueGCs = new Set(ownerGcRows.map((r) => r.companyId).filter(Boolean)).size
  const uniqueTradesUnderOwner = new Set(ownerTradeRows.map((r) => r.companyId).filter(Boolean)).size
  const uniqueTradesUnderGC = new Set(gcTradeRows.map((r) => r.companyId).filter(Boolean)).size

  const answeredCount = assignments.filter((a) => ANSWERED_STATUSES.includes(a.status)).length
  const unansweredCount = assignments.filter((a) => UNANSWERED_STATUSES.includes(a.status)).length

  if (companyLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (!company) {
    return <div className="text-gray-500">Company not found.</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/mojo-admin/companies" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft size={14} />
          Companies
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
        <p className="mt-1 text-sm text-gray-500 capitalize">
          {company.type} · Billing: {company.billing_mode === 'platform_only' ? 'Platform only' : 'Pays for everyone'}
        </p>
      </div>

      {isOwner && <DomoDashboardCard company={company} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<Users size={20} />} label="Users" value={teamMembers.length} color="text-brand-600" bg="bg-brand-50" />
        {isOwner && (
          <>
            <StatTile icon={<HardHat size={20} />} label="General Contractors" value={uniqueGCs} color="text-indigo-600" bg="bg-indigo-50" />
            <StatTile icon={<Wrench size={20} />} label="Trades" value={uniqueTradesUnderOwner} color="text-purple-600" bg="bg-purple-50" />
          </>
        )}
        {isGC && (
          <StatTile icon={<Wrench size={20} />} label="Trades" value={uniqueTradesUnderGC} color="text-purple-600" bg="bg-purple-50" />
        )}
        <StatTile icon={<ClipboardList size={20} />} label="Questionnaires Assigned" value={assignments.length} color="text-gray-700" bg="bg-gray-100" />
        <StatTile icon={<CheckCircle size={20} />} label="Answered" value={answeredCount} color="text-emerald-600" bg="bg-emerald-50" />
        <StatTile icon={<Clock size={20} />} label="Unanswered" value={unansweredCount} color={unansweredCount > 0 ? 'text-amber-600' : 'text-gray-500'} bg={unansweredCount > 0 ? 'bg-amber-50' : 'bg-gray-50'} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Users</h2>
        </div>
        {teamLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : teamMembers.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">No users found</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {teamMembers.map((m) => (
              <div key={m.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">{m.full_name || m.email || 'Unknown'}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.user_role === 'admin' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>
                  {m.user_role === 'admin' ? 'Admin' : 'Contributor'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Questionnaire Assignments</h2>
        </div>
        {assignmentsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : assignments.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">No questionnaires assigned yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Questionnaire', 'Status', 'Assigned'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{a.questionnaire?.name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ANSWERED_STATUSES.includes(a.status) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(a.created_at), 'MMM d, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
