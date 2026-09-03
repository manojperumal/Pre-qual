import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || ''

export type AskMojoDocumentType = 'safety_manual' | 'sop' | 'other'
export type AskMojoThreadStatus = 'drafting' | 'published'

export interface AskMojoThread {
  id: string
  company_id: string
  created_by: string
  title: string
  document_type: AskMojoDocumentType
  current_draft: string | null
  status: AskMojoThreadStatus
  published_document_id: string | null
  created_at: string
  updated_at: string
}

export interface AskMojoMessage {
  id: string
  thread_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface AskMojoReferenceDoc {
  id: string
  thread_id: string
  file_name: string
  storage_path: string
  created_at: string
}

export function useAskMojoThreads(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['ask_mojo_threads', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ask_mojo_threads')
        .select('*')
        .eq('company_id', companyId!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as AskMojoThread[]
    },
  })
}

export function useAskMojoThread(threadId: string | undefined) {
  return useQuery({
    queryKey: ['ask_mojo_thread', threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ask_mojo_threads').select('*').eq('id', threadId!).single()
      if (error) throw error
      return data as AskMojoThread
    },
  })
}

export function useCreateAskMojoThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (thread: { company_id: string; created_by: string; title: string; document_type: AskMojoDocumentType }) => {
      const { data, error } = await supabase.from('ask_mojo_threads').insert(thread).select().single()
      if (error) throw error
      return data as AskMojoThread
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['ask_mojo_threads', data.company_id] }),
  })
}

export function useAskMojoMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ['ask_mojo_messages', threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ask_mojo_messages')
        .select('*')
        .eq('thread_id', threadId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as AskMojoMessage[]
    },
  })
}

export function useAskMojoReferenceDocs(threadId: string | undefined) {
  return useQuery({
    queryKey: ['ask_mojo_reference_docs', threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ask_mojo_reference_documents')
        .select('*')
        .eq('thread_id', threadId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as AskMojoReferenceDoc[]
    },
  })
}

export function useUploadAskMojoReferenceDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, file }: { threadId: string; file: File }) => {
      const path = `ask-mojo/${threadId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('prequal-documents').upload(path, file)
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('ask_mojo_reference_documents')
        .insert({ thread_id: threadId, file_name: file.name, storage_path: path })
        .select()
        .single()
      if (error) throw error
      return data as AskMojoReferenceDoc
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['ask_mojo_reference_docs', data.thread_id] }),
  })
}

// Sends a chat message and gets Ask Mojo's reply — the server persists both
// the user message and the assistant's response, and extracts an updated
// current_draft when the reply contains one.
export function useSendAskMojoMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, message }: { threadId: string; message: string }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${API_URL}/api/ask-mojo/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || 'Ask Mojo failed to respond')
      }
      return res.json() as Promise<{ message: AskMojoMessage; draft_updated: boolean }>
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ask_mojo_messages', vars.threadId] })
      qc.invalidateQueries({ queryKey: ['ask_mojo_thread', vars.threadId] })
    },
  })
}

// Publishes a thread's current draft into the shared company document
// library (company_documents) — admin-only per that table's RLS.
export function usePublishAskMojoDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      threadId,
      companyId,
      documentType,
      documentName,
      draft,
      uploadedBy,
    }: {
      threadId: string
      companyId: string
      documentType: AskMojoDocumentType
      documentName: string
      draft: string
      uploadedBy: string
    }) => {
      const path = `company-docs/${companyId}/${documentType}-${Date.now()}.txt`
      const blob = new Blob([draft], { type: 'text/plain;charset=utf-8;' })
      const { error: uploadError } = await supabase.storage.from('prequal-documents').upload(path, blob)
      if (uploadError) throw uploadError

      const { data: companyDoc, error: docError } = await supabase
        .from('company_documents')
        .insert({
          company_id: companyId,
          document_type: documentType === 'other' ? 'other' : documentType,
          document_name: documentName,
          storage_path: path,
          uploaded_by: uploadedBy,
        })
        .select()
        .single()
      if (docError) throw docError

      const { error: threadError } = await supabase
        .from('ask_mojo_threads')
        .update({ status: 'published', published_document_id: companyDoc.id })
        .eq('id', threadId)
      if (threadError) throw threadError

      return companyDoc
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ask_mojo_thread', vars.threadId] })
      qc.invalidateQueries({ queryKey: ['ask_mojo_threads', vars.companyId] })
      qc.invalidateQueries({ queryKey: ['company_documents'] })
    },
  })
}
