import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Company } from '@/types'

export type CompanyDocumentType = 'safety_manual' | 'coi' | 'w9' | 'loss_runs' | 'license' | 'sop' | 'other'

export interface CompanyDocument {
  id: string
  company_id: string
  document_type: CompanyDocumentType
  document_name: string
  storage_path: string
  uploaded_by: string | null
  created_at: string
  uploader?: { full_name: string | null; email: string | null }
}

export function useUpdateCompany() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateCompany = useCallback(async (companyId: string, updates: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>>) => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId)
      .select()
      .single()
    setLoading(false)
    if (err) {
      setError(err.message)
      return null
    }
    return data as Company
  }, [])

  return { updateCompany, loading, error }
}

export function getCompanyLogoUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null
  const { data } = supabase.storage.from('company-logos').getPublicUrl(logoPath)
  return data.publicUrl
}

export function useUploadCompanyLogo() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadLogo = useCallback(async (companyId: string, file: File, previousLogoPath?: string | null) => {
    setLoading(true)
    setError(null)

    const ext = file.name.split('.').pop()
    const path = `${companyId}/logo-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('company-logos').upload(path, file)
    if (uploadErr) {
      setError(uploadErr.message)
      setLoading(false)
      return null
    }

    const { data, error: updateErr } = await supabase
      .from('companies')
      .update({ logo_path: path })
      .eq('id', companyId)
      .select()
      .single()

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return null
    }

    if (previousLogoPath) {
      await supabase.storage.from('company-logos').remove([previousLogoPath])
    }

    setLoading(false)
    return data as Company
  }, [])

  return { uploadLogo, loading, error }
}

export function useCompanyDocumentsList(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['company_documents', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*, uploader:profiles!uploaded_by(full_name, email)')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CompanyDocument[]
    },
  })
}

export function useUploadCompanyDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      companyId,
      file,
      documentType,
      uploadedBy,
    }: {
      companyId: string
      file: File
      documentType: CompanyDocumentType
      uploadedBy: string
    }) => {
      const ext = file.name.split('.').pop()
      const path = `company-docs/${companyId}/${documentType}-${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage.from('prequal-documents').upload(path, file)
      if (uploadErr) throw uploadErr

      const { data, error: insertErr } = await supabase
        .from('company_documents')
        .insert({
          company_id: companyId,
          document_type: documentType,
          document_name: file.name,
          storage_path: path,
          uploaded_by: uploadedBy,
        })
        .select()
        .single()
      if (insertErr) throw insertErr
      return data as CompanyDocument
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['company_documents', data.company_id] }),
  })
}

export function useDeleteCompanyDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ companyId, documentId, storagePath }: { companyId: string; documentId: string; storagePath: string }) => {
      await supabase.storage.from('prequal-documents').remove([storagePath])
      const { error } = await supabase.from('company_documents').delete().eq('id', documentId)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['company_documents', vars.companyId] }),
  })
}

export function useCompanyDocumentUrl() {
  return useCallback(async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('prequal-documents').createSignedUrl(storagePath, 300)
    if (error || !data) throw error || new Error('Failed to create link')
    return data.signedUrl
  }, [])
}
