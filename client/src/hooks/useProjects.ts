import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Project } from '@/types'

export function useProjects(userId: string | undefined) {
  return useQuery({
    queryKey: ['projects', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, project_members(count), gc_contact:profiles!gc_primary_contact_id(id,full_name,email,company_name), trade_contact:profiles!trade_primary_contact_id(id,full_name,email,company_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (Project & { project_members: { count: number }[] })[]
    },
  })
}

// For GC team members: only returns projects they're explicitly a member of
export function useMyProjects(userId: string | undefined) {
  return useQuery({
    queryKey: ['my_projects', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('project:projects(*, project_members(count), gc_contact:profiles!gc_primary_contact_id(id,full_name,email,company_name), trade_contact:profiles!trade_primary_contact_id(id,full_name,email,company_name))')
        .eq('user_id', userId!)
      if (error) throw error
      return (data?.map((d: any) => d.project).filter(Boolean) ?? []) as (Project & { project_members: { count: number }[] })[]
    },
  })
}

// Team members under a company (profiles where new_company_id = companyId)
export function useTeamMembers(companyId: string | undefined) {
  return useQuery({
    queryKey: ['team_members', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('new_company_id', companyId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

// For GC/Trade admins: all projects any member of their company is on
export function useCompanyProjects(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company_projects', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: members } = await supabase
        .from('profiles')
        .select('id')
        .eq('new_company_id', companyId!)
      if (!members?.length) return []
      const memberIds = members.map((m: any) => m.id)

      const { data: pm } = await supabase
        .from('project_members')
        .select('project:projects(*, project_members(count), gc_contact:profiles!gc_primary_contact_id(id,full_name,email,company_name), trade_contact:profiles!trade_primary_contact_id(id,full_name,email,company_name))')
        .in('user_id', memberIds)
      if (!pm) return []

      const seen = new Set<string>()
      return pm
        .map((r: any) => r.project)
        .filter((p: any) => p && !seen.has(p.id) && seen.add(p.id)) as (Project & { project_members: { count: number }[] })[]
    },
  })
}

export function useUpdateMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, memberRole }: { userId: string; memberRole: 'admin' | 'contributor' }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ member_role: memberRole, user_role: memberRole })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team_members'] }),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      description,
      address,
      startDate,
      endDate,
      ownerId,
    }: {
      name: string
      description?: string
      address?: string
      startDate?: string
      endDate?: string
      ownerId: string
    }) => {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name,
          description,
          address: address || null,
          start_date: startDate || null,
          end_date: endDate || null,
          owner_id: ownerId,
        })
        .select()
        .single()
      if (error) throw error
      await supabase
        .from('project_members')
        .insert({ project_id: project.id, user_id: ownerId, role: 'owner' })
      return project as Project
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export interface BulkProjectRow {
  name: string
  description?: string
  address?: string
  startDate?: string
  endDate?: string
}

export function useBulkCreateProjects() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rows, ownerId }: { rows: BulkProjectRow[]; ownerId: string }) => {
      const { data: projects, error } = await supabase
        .from('projects')
        .insert(
          rows.map((r) => ({
            name: r.name,
            description: r.description || null,
            address: r.address || null,
            start_date: r.startDate || null,
            end_date: r.endDate || null,
            owner_id: ownerId,
          }))
        )
        .select()
      if (error) throw error

      await supabase
        .from('project_members')
        .insert((projects ?? []).map((p) => ({ project_id: p.id, user_id: ownerId, role: 'owner' })))

      return projects as Project[]
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      address,
      startDate,
      endDate,
    }: {
      id: string
      name: string
      description?: string
      address?: string
      startDate?: string
      endDate?: string
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .update({
          name,
          description: description || null,
          address: address || null,
          start_date: startDate || null,
          end_date: endDate || null,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useSetProjectPrimaryContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      field,
      userId,
    }: {
      projectId: string
      field: 'gc_primary_contact_id' | 'trade_primary_contact_id'
      userId: string | null
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .update({ [field]: userId })
        .eq('id', projectId)
        .select()
        .single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project_members', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('*, profile:profiles(*)')
        .eq('project_id', projectId!)
        .order('joined_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export interface OwnerContractorRow {
  memberId: string
  joinedAt: string
  /** Null means this company accepted an invitation but isn't a member of any project yet. */
  projectId: string | null
  projectName: string | null
  startDate: string | null
  endDate: string | null
  contractorId: string
  contractorName: string | null
  contractorEmail: string | null
  companyId: string | null
  companyName: string | null
  city: string | null
  state: string | null
  logoPath: string | null
  submissionStatus: string | null
  /** Company name(s) of the GC(s) coordinating this contractor on this project — empty if invited directly. */
  gcCompanies: string[]
}

// Companies that accepted an invitation from senderId (of the given
// recipient role) but aren't in `existingContractorIds` — i.e. not yet a
// member of any of the sender's/coordinated projects, and so otherwise
// invisible on the Trades/GCs roster despite having accepted.
async function fetchEcosystemOnlyRows(
  senderId: string,
  recipientRole: 'gc' | 'trade',
  existingContractorIds: Set<string>
): Promise<OwnerContractorRow[]> {
  const { data: invites, error } = await supabase
    .from('invitations')
    .select(
      'accepted_by, accepted_profile:profiles!accepted_by(id, full_name, email, company_name, new_company_id, company:companies!new_company_id(id, name, city, state, logo_path))'
    )
    .eq('sender_id', senderId)
    .eq('recipient_role', recipientRole)
    .eq('status', 'accepted')
    .not('accepted_by', 'is', null)
  if (error) throw error

  const seen = new Set<string>()
  const rows: OwnerContractorRow[] = []
  for (const inv of invites ?? []) {
    const profile = (inv as any).accepted_profile
    if (!profile || existingContractorIds.has(profile.id) || seen.has(profile.id)) continue
    seen.add(profile.id)
    rows.push({
      memberId: `ecosystem-${profile.id}`,
      joinedAt: '',
      projectId: null,
      projectName: null,
      startDate: null,
      endDate: null,
      contractorId: profile.id,
      contractorName: profile.full_name ?? null,
      contractorEmail: profile.email ?? null,
      companyId: profile.company?.id ?? null,
      companyName: profile.company?.name ?? profile.company_name ?? null,
      city: profile.company?.city ?? null,
      state: profile.company?.state ?? null,
      logoPath: profile.company?.logo_path ?? null,
      submissionStatus: null,
      gcCompanies: [],
    })
  }
  return rows
}

const CONTRACTOR_MEMBER_SELECT =
  'id, project_id, user_id, joined_at, profile:profiles!inner(id, full_name, email, company_name, company_type, role, company:companies!new_company_id(id, name, city, state, logo_path))'

function roleOf(profile: any): string {
  return profile?.company_type ?? profile?.role
}

export function useOwnerGCs(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['owner_gcs', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<OwnerContractorRow[]> => {
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id, name, start_date, end_date')
        .eq('owner_id', ownerId!)
      if (pErr) throw pErr

      const projectIds = (projects ?? []).map((p) => p.id)

      let memberRows: OwnerContractorRow[] = []
      if (projectIds.length) {
        const { data: members, error: mErr } = await supabase
          .from('project_members')
          .select(CONTRACTOR_MEMBER_SELECT)
          .in('project_id', projectIds)
        if (mErr) throw mErr

        const gcMembers = (members ?? []).filter((m: any) => roleOf(m.profile) === 'gc')

        const { data: submissions } = await supabase
          .from('project_submissions')
          .select('project_id, contractor_id, status')
          .in('project_id', projectIds)

        const subMap = new Map<string, string>()
        for (const s of submissions ?? []) {
          subMap.set(`${s.project_id}:${s.contractor_id}`, s.status)
        }

        const projectMap = new Map((projects ?? []).map((p) => [p.id, p]))

        memberRows = gcMembers.map((m: any): OwnerContractorRow => {
          const project = projectMap.get(m.project_id)!
          return {
            memberId: m.id,
            joinedAt: m.joined_at,
            projectId: m.project_id,
            projectName: project.name,
            startDate: project.start_date ?? null,
            endDate: project.end_date ?? null,
            contractorId: m.user_id,
            contractorName: m.profile?.full_name ?? null,
            contractorEmail: m.profile?.email ?? null,
            companyId: m.profile?.company?.id ?? null,
            companyName: m.profile?.company?.name ?? m.profile?.company_name ?? null,
            city: m.profile?.company?.city ?? null,
            state: m.profile?.company?.state ?? null,
            logoPath: m.profile?.company?.logo_path ?? null,
            submissionStatus: subMap.get(`${m.project_id}:${m.user_id}`) ?? null,
            gcCompanies: [],
          }
        })
      }

      const ecosystemRows = await fetchEcosystemOnlyRows(ownerId!, 'gc', new Set(memberRows.map((r) => r.contractorId)))
      return [...memberRows, ...ecosystemRows]
    },
  })
}

async function fetchTradeRows(projectIds: string[]): Promise<OwnerContractorRow[]> {
  if (!projectIds.length) return []

  const { data: members, error: mErr } = await supabase
    .from('project_members')
    .select(CONTRACTOR_MEMBER_SELECT)
    .in('project_id', projectIds)
  if (mErr) throw mErr

  const tradeMembers = (members ?? []).filter((m: any) => roleOf(m.profile) === 'trade')
  if (!tradeMembers.length) return []

  // GC(s) coordinating each project, derived directly from project membership
  const gcByProject = new Map<string, string[]>()
  for (const m of members ?? []) {
    if (roleOf(m.profile) !== 'gc') continue
    const name = (m as any).profile?.company?.name ?? (m as any).profile?.company_name
    if (!name) continue
    const list = gcByProject.get((m as any).project_id) ?? []
    if (!list.includes(name)) list.push(name)
    gcByProject.set((m as any).project_id, list)
  }

  const { data: submissions } = await supabase
    .from('project_submissions')
    .select('project_id, contractor_id, status')
    .in('project_id', projectIds)

  const subMap = new Map<string, string>()
  for (const s of submissions ?? []) {
    subMap.set(`${s.project_id}:${s.contractor_id}`, s.status)
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date')
    .in('id', projectIds)
  const projectMap = new Map((projects ?? []).map((p) => [p.id, p]))

  return tradeMembers.map((m: any): OwnerContractorRow => {
    const project = projectMap.get(m.project_id)
    return {
      memberId: m.id,
      joinedAt: m.joined_at,
      projectId: m.project_id,
      projectName: project?.name ?? '—',
      startDate: project?.start_date ?? null,
      endDate: project?.end_date ?? null,
      contractorId: m.user_id,
      contractorName: m.profile?.full_name ?? null,
      contractorEmail: m.profile?.email ?? null,
      companyId: m.profile?.company?.id ?? null,
      companyName: m.profile?.company?.name ?? m.profile?.company_name ?? null,
      city: m.profile?.company?.city ?? null,
      state: m.profile?.company?.state ?? null,
      logoPath: m.profile?.company?.logo_path ?? null,
      submissionStatus: subMap.get(`${m.project_id}:${m.user_id}`) ?? null,
      gcCompanies: gcByProject.get(m.project_id) ?? [],
    }
  })
}

export function useOwnerTrades(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['owner_trades', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<OwnerContractorRow[]> => {
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', ownerId!)
      if (pErr) throw pErr
      const memberRows = await fetchTradeRows((projects ?? []).map((p) => p.id))
      const ecosystemRows = await fetchEcosystemOnlyRows(ownerId!, 'trade', new Set(memberRows.map((r) => r.contractorId)))
      return [...memberRows, ...ecosystemRows]
    },
  })
}

// For GCs: trades on any project they themselves coordinate (regardless of who invited the trade)
export function useGCTrades(gcUserId: string | undefined) {
  return useQuery({
    queryKey: ['gc_trades', gcUserId],
    enabled: !!gcUserId,
    queryFn: async (): Promise<OwnerContractorRow[]> => {
      const { data: myMemberships, error: mErr } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', gcUserId!)
        .eq('role', 'gc')
      if (mErr) throw mErr
      const memberRows = await fetchTradeRows((myMemberships ?? []).map((m) => m.project_id))
      const ecosystemRows = await fetchEcosystemOnlyRows(gcUserId!, 'trade', new Set(memberRows.map((r) => r.contractorId)))
      return [...memberRows, ...ecosystemRows]
    },
  })
}
