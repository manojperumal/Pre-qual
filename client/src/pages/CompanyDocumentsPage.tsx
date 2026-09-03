import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useCompanyDocumentsList,
  useUploadCompanyDocument,
  useDeleteCompanyDocument,
  useCompanyDocumentUrl,
  CompanyDocumentType,
} from '@/hooks/useCompany'
import { FolderOpen, Upload, FileText, Trash2, ExternalLink, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

const DOCUMENT_TYPE_OPTIONS: { value: CompanyDocumentType; label: string }[] = [
  { value: 'safety_manual', label: 'Safety Manual' },
  { value: 'sop', label: 'Standard Operating Procedure' },
  { value: 'coi', label: 'Certificate of Insurance (COI)' },
  { value: 'w9', label: 'W-9' },
  { value: 'loss_runs', label: 'Loss Runs' },
  { value: 'license', label: 'License' },
  { value: 'other', label: 'Other' },
]

const DOCUMENT_TYPE_LABELS = Object.fromEntries(DOCUMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]))

export default function CompanyDocumentsPage() {
  const { profile } = useAuth()
  const companyId = profile?.new_company_id ?? null
  const isAdmin = profile?.user_role === 'admin'

  const { data: documents = [], isLoading } = useCompanyDocumentsList(companyId)
  const uploadDocument = useUploadCompanyDocument()
  const deleteDocument = useDeleteCompanyDocument()
  const getSignedUrl = useCompanyDocumentUrl()

  const [selectedType, setSelectedType] = useState<CompanyDocumentType>('safety_manual')
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  async function handleUpload(file: File) {
    if (!companyId || !profile?.id) return
    setError(null)
    try {
      await uploadDocument.mutateAsync({ companyId, file, documentType: selectedType, uploadedBy: profile.id })
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Library</h1>
          <p className="mt-1 text-sm text-gray-500">Safety manuals, SOPs, and other documents shared across your company</p>
        </div>
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
            <span className="btn-primary inline-flex items-center gap-2 text-sm cursor-pointer">
              <Upload size={16} />
              {uploadDocument.isPending ? 'Uploading…' : 'Upload Document'}
            </span>
          </label>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500" htmlFor="doc-type-select">Next upload will be tagged as:</label>
          <select
            id="doc-type-select"
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as CompanyDocumentType)}
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2 text-sm">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : documents.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <FolderOpen size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-700">No documents yet</p>
          <p className="text-sm mt-1">
            {isAdmin ? 'Upload a document, or publish one from Ask Mojo' : 'Your company admin can upload documents here'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <div key={doc.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
                <FileText size={18} className="text-brand-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.document_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {DOCUMENT_TYPE_LABELS[doc.document_type]} · {format(new Date(doc.created_at), 'MMM d, yyyy')}
                    {doc.uploader?.full_name && <> · {doc.uploader.full_name}</>}
                  </p>
                </div>
                <button
                  onClick={() => handleView(doc.storage_path, doc.id)}
                  disabled={openingId === doc.id}
                  className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium flex-shrink-0"
                >
                  <ExternalLink size={13} />
                  {openingId === doc.id ? 'Opening…' : 'View'}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(doc.id, doc.storage_path)}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
