import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Project } from '@/types'

export function useProjects(userId: string | undefined) {
  return useQuery({
    queryKey: ['projects', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Get projects where user is owner or member
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
    mutationFn: async ({ name, description, ownerId }: { name: string; description?: string; ownerId: string }) => {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({ name, description, owner_id: ownerId })
        .select()
        .single()
      if (error) throw error
      // Insert owner as a project member
      await supabase
        .from('project_members')
        .insert({ project_id: project.id, user_id: ownerId, role: 'owner' })
      return project as Project
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
