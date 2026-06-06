import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Prequalification,
  PrequalDocument,
  Invitation,
  PrequalStatus,
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || ''

export function useMyPrequals(userId: string | undefined) {
  return useQuery({
    queryKey: ['preqals', 'mine', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('prequalifications')
        .select('*, applicant:profiles!applicant_id(*), requester:profiles!requester_id(*)')
        .or(`applicant_id.eq.${userId},requester_id.eq.${userId}`)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as (Prequalification & { applicant: unknown; requester: unknown })[]
    },
    enabled: !!userId,
  })
}

export function usePrequal(id: string | undefined) {
  return useQuery({
    queryKey: ['preqals', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('prequalifications')
        .select('*, applicant:profiles!applicant_id(*), requester:profiles!requester_id(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Prequalification & { applicant: unknown; requester: unknown }
    },
    enabled: !!id,
  })
}

export function useCreatePrequal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<Prequalification>) => {
      const { data: result, error } = await supabase
        .from('prequalifications')
        .insert(data)
        .select()
        .single()
      if (error) throw error
      return result as Prequalification
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preqals'] })
    },
  })
}

export function useUpdatePrequal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Prequalification> }) => {
      const { data: result, error } = await supabase
        .from('prequalifications')
        .update(data)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return result as Prequalification
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['preqals', id] })
      qc.invalidateQueries({ queryKey: ['preqals', 'mine'] })
    },
  })
}

export function useUpdatePrequalStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PrequalStatus }) => {
      const { data, error } = await supabase
        .from('prequalifications')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Prequalification
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preqals'] })
    },
  })
}

export function usePrequalDocs(prequalId: string | undefined) {
  return useQuery({
    queryKey: ['prequal-docs', prequalId],
    queryFn: async () => {
      if (!prequalId) return []
      const { data, error } = await supabase
        .from('prequalification_documents')
        .select('*')
        .eq('prequalification_id', prequalId)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data as PrequalDocument[]
    },
    enabled: !!prequalId,
  })
}

export function useDeleteDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ docId, storagePath }: { docId: string; storagePath: string }) => {
      await supabase.storage.from('prequal-documents').remove([storagePath])
      const { error } = await supabase
        .from('prequalification_documents')
        .delete()
        .eq('id', docId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prequal-docs'] })
    },
  })
}

export function useSentInvitations(senderId: string | undefined) {
  return useQuery({
    queryKey: ['invitations', 'sent', senderId],
    queryFn: async () => {
      if (!senderId) return []
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('sender_id', senderId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Invitation[]
    },
    enabled: !!senderId,
  })
}

export interface ReceivedInvitation extends Invitation {
  sender: { full_name: string | null; company_name: string | null; role: string } | null
  project: { id: string; name: string } | null
}

export function useReceivedInvitations(email: string | undefined) {
  return useQuery({
    queryKey: ['invitations', 'received', email],
    queryFn: async () => {
      if (!email) return []
      const { data, error } = await supabase
        .from('invitations')
        .select('*, sender:profiles!sender_id(full_name, company_name, role), project:projects(id, name)')
        .eq('recipient_email', email)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ReceivedInvitation[]
    },
    enabled: !!email,
  })
}

export function useSendInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invitation: {
      recipient_email: string
      recipient_role: 'gc' | 'trade' | 'gc_member' | 'owner_member' | 'trade_member'
      project_id?: string
    }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(`${API_URL}/api/invitations/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(invitation),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send invitation')
      }

      return res.json() as Promise<Invitation>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] })
    },
  })
}

export function useMyProjectSubmissions(contractorId: string | undefined) {
  return useQuery({
    queryKey: ['my_project_submissions', contractorId],
    enabled: !!contractorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_submissions')
        .select('*')
        .eq('contractor_id', contractorId!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}
