import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateCompany } from '@/hooks/useCompany'
import { supabase } from '@/lib/supabase'
import { CheckCircle } from 'lucide-react'

interface AccountForm {
  full_name: string
}

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

  const [accountSaved, setAccountSaved] = useState(false)
  const [companySaved, setCompanySaved] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)

  const accountForm = useForm<AccountForm>({ defaultValues: { full_name: profile?.full_name ?? '' } })
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
    accountForm.reset({ full_name: profile?.full_name ?? '' })
  }, [profile?.full_name])

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

  async function onSaveAccount(data: AccountForm) {
    if (!profile?.id) return
    setAccountError(null)
    const { error } = await supabase.from('profiles').update({ full_name: data.full_name }).eq('id', profile.id)
    if (error) {
      setAccountError(error.message)
      return
    }
    setAccountSaved(true)
    setTimeout(() => setAccountSaved(false), 2000)
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and company information</p>
      </div>

      {/* Account */}
      <form onSubmit={accountForm.handleSubmit(onSaveAccount)} className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Your Account</h2>

        {accountError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{accountError}</div>
        )}
        {accountSaved && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
            <CheckCircle size={16} />
            Saved
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input-field" {...accountForm.register('full_name')} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input-field bg-gray-50 text-gray-500" value={profile?.email ?? ''} disabled />
          </div>
        </div>

        <button type="submit" disabled={accountForm.formState.isSubmitting} className="btn-primary text-sm">
          Save Account
        </button>
      </form>

      {/* Company */}
      <form onSubmit={companyForm.handleSubmit(onSaveCompany)} className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Company Information</h2>
        <p className="text-xs text-gray-500 -mt-2">Shared across everyone on your company's account</p>

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
            Only company admins can edit this information.
          </div>
        )}

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
