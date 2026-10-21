import { useState } from 'react'
import {
  useCompanyDocumentsList,
  useUploadCompanyDocument,
  useDeleteCompanyDocument,
  useCompanyDocumentUrl,
  CompanyDocumentType,
} from '@/hooks/useCompany'
import { Upload, FileText, Trash2, ExternalLink, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface CompanyDocumentFieldProps {
  companyId: string | null | undefined
  uploadedBy: string | null | undefined
  documentType: CompanyDocumentType
  label: string
  isAdmin: boolean
}

// Lets a profile section (Insurance, Safety, PTP, Bonding) attach its
// backing file directly, reusing the same company_documents table/bucket
// as the Document Library — so these show up there too, and questionnaire
// AI-complete can already read them.
export function CompanyDocumentField({ companyId, uploadedBy, documentType, label, isAdmin }: CompanyDocumentFieldProps) {
  const { data: allDocuments = [] } = useCompanyDocumentsList(companyId)
  const documents = allDocuments.filter((d) => d.document_type === documentType)
  const uploadDocument = useUploadCompanyDocument()
  const deleteDocument = useDeleteCompanyDocument()
  const getSignedUrl = useCompanyDocumentUrl()

  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  async function handleUpload(file: File) {
    if (!companyId || !uploadedBy) return
    setError(null)
    try {
      await uploadDocument.mutateAsync({ companyId, file, documentType, uploadedBy })
    } catch (err: any) {
      setError(err?.message || 'Upload failed. Please try again.')
    }
  }

  async function handleView(storagePath: string, docId: string) {
    setOpeningId(docId)
    try {
      const url = await getSignedUrl(storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      setError(err?.message || 'Could not open this document.')
    } finally {
      setOpeningId(null)
    }
  }

  async function handleDelete(documentId: string, storagePath: string) {
    if (!companyId) return
    if (!confirm('Delete this document?')) return
    await deleteDocument.mutateAsync({ companyId, documentId, storagePath })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label mb-0">{label}</label>
        {isAdmin && (
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              disabled={uploadDocument.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
            <span className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium cursor-pointer">
              <Upload size={13} />
              {uploadDocument.isPending ? 'Uploading…' : 'Attach File'}
            </span>
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2 text-xs mb-2">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-xs text-gray-400">No file attached yet. This will also appear in the Document Library.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {documents.map((doc) => (
            <div key={doc.id} className="px-3 py-2 flex items-center gap-2">
              <FileText size={14} className="text-brand-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{doc.document_name}</p>
                <p className="text-[11px] text-gray-400">{format(new Date(doc.created_at), 'MMM d, yyyy')}</p>
              </div>
              <button
                type="button"
                onClick={() => handleView(doc.storage_path, doc.id)}
                disabled={openingId === doc.id}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium flex-shrink-0"
              >
                <ExternalLink size={12} />
                {openingId === doc.id ? 'Opening…' : 'View'}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id, doc.storage_path)}
                  className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
