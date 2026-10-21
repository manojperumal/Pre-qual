import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateCompany } from '@/hooks/useCompany'
import { CompanyLogoUpload } from '@/components/CompanyLogoUpload'
import { CheckCircle } from 'lucide-react'

interface CompanyForm {
  name: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  website: string
}

export default function OwnerSettingsPage() {
  const { profile, company } = useAuth()
  const { updateCompany, loading: companyLoading, error: companyError } = useUpdateCompany()
  const isAdmin = profile?.user_role === 'admin'

  const [logoPath, setLogoPath] = useState<string | null | undefined>(company?.logo_path)
  useEffect(() => setLogoPath(company?.logo_path), [company?.logo_path])

  const [companySaved, setCompanySaved] = useState(false)

  const companyForm = useForm<CompanyForm>({
    defaultValues: {
      name: company?.name ?? '',
      address: company?.address ?? '',
      city: company?.city ?? '',
      state: company?.state ?? '',
      zip: company?.zip ?? '',
      phone: company?.phone ?? '',
      website: company?.website ?? '',
    },
  })

  useEffect(() => {
    companyForm.reset({
      name: company?.name ?? '',
      address: company?.address ?? '',
      city: company?.city ?? '',
      state: company?.state ?? '',
      zip: company?.zip ?? '',
      phone: company?.phone ?? '',
      website: company?.website ?? '',
    })
  }, [company])

  async function onSaveCompany(data: CompanyForm) {
    if (!profile?.new_company_id) return
    const result = await updateCompany(profile.new_company_id, {
      name: data.name,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      phone: data.phone || null,
      website: data.website || null,
    })
    if (result) {
      setCompanySaved(true)
      setTimeout(() => setCompanySaved(false), 2000)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization</h1>
        <p className="text-sm text-gray-500 mt-1">Your company's profile, shared across everyone on your account</p>
      </div>

      {/* Company */}
      <form onSubmit={companyForm.handleSubmit(onSaveCompany)} className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Company Information</h2>

        {companyError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{companyError}</div>
        )}
        {companySaved && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
            <CheckCircle size={16} />
            Saved
          </div>
        )}
        {!isAdmin && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm">
            You can view your company's profile here. Only a company admin can make changes.
          </div>
        )}

        <CompanyLogoUpload
          companyId={profile?.new_company_id}
          logoPath={logoPath}
          disabled={!isAdmin}
          onUploaded={setLogoPath}
        />

        <fieldset disabled={!isAdmin} className="space-y-4 disabled:opacity-60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Company Name</label>
              <input className="input-field" {...companyForm.register('name')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input-field" {...companyForm.register('address')} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input-field" {...companyForm.register('city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input-field" {...companyForm.register('state')} />
            </div>
            <div>
              <label className="label">ZIP</label>
              <input className="input-field" {...companyForm.register('zip')} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input-field" {...companyForm.register('phone')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Website</label>
              <input className="input-field" {...companyForm.register('website')} />
            </div>
          </div>

          <button type="submit" disabled={companyLoading} className="btn-primary text-sm">
            Save Company
          </button>
        </fieldset>
      </form>
    </div>
  )
}
