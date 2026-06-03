import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ContractorProfile, ProjectSubmission } from '@/types'

export function useContractorProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['contractor_profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contractor_profiles')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as ContractorProfile | null
    },
  })
}

export function useUpsertContractorProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (profile: Partial<ContractorProfile> & { user_id: string }) => {
      const { data, error } = await supabase
        .from('contractor_profiles')
        .upsert({ ...profile, last_updated: new Date().toISOString() }, { onConflict: 'user_id' })
        .select()
        .single()
      if (error) throw error
      return data as ContractorProfile
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['contractor_profile', data.user_id] })
    },
  })
}

export function useProjectSubmission(projectId: string | undefined, contractorId: string | undefined) {
  return useQuery({
    queryKey: ['submission', projectId, contractorId],
    enabled: !!projectId && !!contractorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_submissions')
        .select('*')
        .eq('project_id', projectId!)
        .eq('contractor_id', contractorId!)
        .maybeSingle()
      if (error) throw error
      return data as ProjectSubmission | null
    },
  })
}

export function useUpsertSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (submission: {
      project_id: string
      contractor_id: string
      status: string
      snapshot: Record<string, unknown>
      flagged_no_ptp?: boolean
      flagged_high_emr?: boolean
    }) => {
      const { data, error } = await supabase
        .from('project_submissions')
        .upsert(submission, { onConflict: 'project_id,contractor_id' })
        .select()
        .single()
      if (error) throw error
      return data as ProjectSubmission
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['submission', data.project_id, data.contractor_id] })
      qc.invalidateQueries({ queryKey: ['project_submissions'] })
    },
  })
}

export function useProjectSubmissions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project_submissions', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_submissions')
        .select('*, contractor:profiles!contractor_id(full_name, company_name, email)')
        .eq('project_id', projectId!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as (ProjectSubmission & { contractor: { full_name: string; company_name: string; email: string } })[]
    },
  })
}

export function useOwnerPendingSubmissions(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['owner_pending_submissions', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('owner_id', ownerId!)
      if (!projects?.length) return []

      const projectIds = projects.map((p) => p.id)
      const projectMap = new Map(projects.map((p) => [p.id, p.name]))

      const { data: submissions, error } = await supabase
        .from('project_submissions')
        .select('*, contractor:profiles!contractor_id(full_name, company_name, email)')
        .in('project_id', projectIds)
        .in('status', ['submitted', 'under_review'])
        .order('updated_at', { ascending: false })
      if (error) throw error

      return (submissions ?? []).map((s) => ({
        ...(s as ProjectSubmission & { contractor: { full_name: string; company_name: string; email: string } }),
        project_name: projectMap.get(s.project_id) ?? 'Unknown',
      }))
    },
  })
}
