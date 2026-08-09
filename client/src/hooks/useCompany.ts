import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Company } from '@/types'

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

export function useCompanyDocuments(companyId: string | null | undefined) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadDocument = useCallback(async (
    file: File,
    documentType: 'safety_manual' | 'coi' | 'w9' | 'loss_runs' | 'license' | 'other',
    uploadedBy: string
  ) => {
    if (!companyId) return null
    setLoading(true)
    setError(null)

    const ext = file.name.split('.').pop()
    const path = `company-docs/${companyId}/${documentType}-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('prequal-documents')
      .upload(path, file)

    if (uploadErr) {
      setError(uploadErr.message)
      setLoading(false)
      return null
    }

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

    setLoading(false)
    if (insertErr) {
      setError(insertErr.message)
      return null
    }
    return data
  }, [companyId])

  const deleteDocument = useCallback(async (documentId: string, storagePath: string) => {
    setLoading(true)
    setError(null)

    await supabase.storage.from('prequal-documents').remove([storagePath])

    const { error: deleteErr } = await supabase
      .from('company_documents')
      .delete()
      .eq('id', documentId)

    setLoading(false)
    if (deleteErr) {
      setError(deleteErr.message)
      return false
    }
    return true
  }, [])

  return { uploadDocument, deleteDocument, loading, error }
}
