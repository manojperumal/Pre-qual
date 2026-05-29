import { useRef, useState, useCallback } from 'react'
import { Upload, X, FileText, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DocType } from '@/types'
import clsx from 'clsx'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

interface FileUploadProps {
  prequalId: string
  docType: DocType
  label: string
  onUploaded?: (storagePath: string, fileName: string) => void
}

export function FileUpload({ prequalId, docType, label, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)

      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Only PDF, JPEG, PNG, and WebP files are allowed.')
        return
      }

      // Validate size
      if (file.size > MAX_SIZE_BYTES) {
        setError('File must be smaller than 10 MB.')
        return
      }

      setUploading(true)
      try {
        const ext = file.name.split('.').pop()
        const storagePath = `${prequalId}/${docType}/${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('prequal-documents')
          .upload(storagePath, file, { upsert: false })

        if (uploadError) throw uploadError

        // Record in DB
        const { error: dbError } = await supabase
          .from('prequalification_documents')
          .insert({
            prequalification_id: prequalId,
            doc_type: docType,
            file_name: file.name,
            storage_path: storagePath,
          })

        if (dbError) throw dbError

        setUploaded(file.name)
        onUploaded?.(storagePath, file.name)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        setError(message)
      } finally {
        setUploading(false)
      }
    },
    [prequalId, docType, onUploaded]
  )

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="mt-2">
      <label className="label">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={clsx(
          'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
          dragOver
            ? 'border-brand-400 bg-brand-50'
            : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
        )}
        onClick={() => inputRef.current?.click()}
      >
        {uploaded ? (
          <div className="flex items-center justify-center gap-2 text-green-600">
            <FileText size={18} />
            <span className="text-sm font-medium">{uploaded}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUploaded(null) }}
              className="text-gray-400 hover:text-gray-600 ml-1"
            >
              <X size={14} />
            </button>
          </div>
        ) : uploading ? (
          <div className="flex items-center justify-center gap-2 text-brand-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-600" />
            <span className="text-sm">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500">
            <Upload size={20} />
            <span className="text-sm">Drop file here or click to browse</span>
            <span className="text-xs text-gray-400">PDF, JPEG, PNG • Max 10 MB</span>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-1 flex items-center gap-1 text-red-600 text-xs">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  )
}
