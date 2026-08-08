import { useRef, useState } from 'react'
import { useUploadCompanyLogo, getCompanyLogoUrl } from '@/hooks/useCompany'
import { Building2, Upload } from 'lucide-react'

interface CompanyLogoUploadProps {
  companyId: string | null | undefined
  logoPath: string | null | undefined
  disabled?: boolean
  onUploaded?: (logoPath: string) => void
}

export function CompanyLogoUpload({ companyId, logoPath, disabled, onUploaded }: CompanyLogoUploadProps) {
  const { uploadLogo, loading, error } = useUploadCompanyLogo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const logoUrl = preview ?? getCompanyLogoUrl(logoPath)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !companyId) return

    setPreview(URL.createObjectURL(file))
    const updated = await uploadLogo(companyId, file, logoPath)
    if (updated) onUploaded?.(updated.logo_path ?? '')
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
        {logoUrl ? (
          <img src={logoUrl} alt="Company logo" className="w-full h-full object-cover" />
        ) : (
          <Building2 size={24} className="text-gray-400" />
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || loading}
          className="btn-secondary inline-flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <Upload size={14} />
          {loading ? 'Uploading…' : logoUrl ? 'Change Logo' : 'Upload Logo'}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  )
}
