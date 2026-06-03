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
        .select('*, project_members(count)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (Project & { project_members: { count: number }[] })[]
    },
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      description,
      startDate,
      endDate,
      ownerId,
    }: {
      name: string
      description?: string
      startDate?: string
      endDate?: string
      ownerId: string
    }) => {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name,
          description,
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

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      startDate,
      endDate,
    }: {
      id: string
      name: string
      description?: string
      startDate?: string
      endDate?: string
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .update({
          name,
          description: description || null,
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
  projectId: string
  projectName: string
  startDate: string | null
  endDate: string | null
  contractorId: string
  contractorName: string | null
  contractorEmail: string | null
  companyName: string | null
  submissionStatus: string | null
  gcName: string | null
  gcCompany: string | null
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
      if (!projects?.length) return []

      const projectIds = projects.map((p) => p.id)

      const { data: members, error: mErr } = await supabase
        .from('project_members')
        .select('id, project_id, user_id, joined_at, profile:profiles!inner(id, full_name, email, company_name, role)')
        .in('project_id', projectIds)
      if (mErr) throw mErr

      const gcMembers = (members ?? []).filter((m: any) => m.profile?.role === 'gc')
      if (!gcMembers.length) return []

      const { data: submissions } = await supabase
        .from('project_submissions')
        .select('project_id, contractor_id, status')
        .in('project_id', projectIds)

      const subMap = new Map<string, string>()
      for (const s of submissions ?? []) {
        subMap.set(`${s.project_id}:${s.contractor_id}`, s.status)
      }

      const projectMap = new Map(projects.map((p) => [p.id, p]))

      return gcMembers.map((m: any): OwnerContractorRow => {
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
          companyName: m.profile?.company_name ?? null,
          submissionStatus: subMap.get(`${m.project_id}:${m.user_id}`) ?? null,
          gcName: null,
          gcCompany: null,
        }
      })
    },
  })
}

export function useOwnerTrades(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['owner_trades', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<OwnerContractorRow[]> => {
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id, name, start_date, end_date')
        .eq('owner_id', ownerId!)
      if (pErr) throw pErr
      if (!projects?.length) return []

      const projectIds = projects.map((p) => p.id)

      const { data: members, error: mErr } = await supabase
        .from('project_members')
        .select('id, project_id, user_id, joined_at, profile:profiles!inner(id, full_name, email, company_name, role)')
        .in('project_id', projectIds)
      if (mErr) throw mErr

      const tradeMembers = (members ?? []).filter((m: any) => m.profile?.role === 'trade')
      if (!tradeMembers.length) return []

      const { data: submissions } = await supabase
        .from('project_submissions')
        .select('project_id, contractor_id, status')
        .in('project_id', projectIds)

      const subMap = new Map<string, string>()
      for (const s of submissions ?? []) {
        subMap.set(`${s.project_id}:${s.contractor_id}`, s.status)
      }

      const tradeEmails = [...new Set(tradeMembers.map((m: any) => m.profile?.email).filter(Boolean))]
      const { data: invitations } = await supabase
        .from('invitations')
        .select('project_id, recipient_email, sender:profiles!sender_id(full_name, company_name, role)')
        .in('project_id', projectIds)
        .eq('recipient_role', 'trade')
        .eq('status', 'accepted')
        .in('recipient_email', tradeEmails)

      const gcMap = new Map<string, { gcName: string | null; gcCompany: string | null }>()
      for (const inv of invitations ?? []) {
        const sender = inv.sender as any
        if (sender?.role === 'gc') {
          gcMap.set(`${inv.project_id}:${inv.recipient_email}`, {
            gcName: sender.full_name ?? null,
            gcCompany: sender.company_name ?? null,
          })
        }
      }

      const projectMap = new Map(projects.map((p) => [p.id, p]))

      return tradeMembers.map((m: any): OwnerContractorRow => {
        const project = projectMap.get(m.project_id)!
        const gcInfo = gcMap.get(`${m.project_id}:${m.profile?.email}`) ?? { gcName: null, gcCompany: null }
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
          companyName: m.profile?.company_name ?? null,
          submissionStatus: subMap.get(`${m.project_id}:${m.user_id}`) ?? null,
          gcName: gcInfo.gcName,
          gcCompany: gcInfo.gcCompany,
        }
      })
    },
  })
}
