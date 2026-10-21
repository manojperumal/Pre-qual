import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { roleLabel } from '@/lib/roleLabels'
import { CheckCircle, AlertCircle } from 'lucide-react'

interface AccountForm {
  full_name: string
}

interface PasswordForm {
  password: string
  confirmPassword: string
}

export default function MyAccountPage() {
  const { profile } = useAuth()

  const [accountSaved, setAccountSaved] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const accountForm = useForm<AccountForm>({ defaultValues: { full_name: profile?.full_name ?? '' } })
  const passwordForm = useForm<PasswordForm>({ defaultValues: { password: '', confirmPassword: '' } })

  useEffect(() => {
    accountForm.reset({ full_name: profile?.full_name ?? '' })
  }, [profile?.full_name])

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

  async function onSavePassword(data: PasswordForm) {
    setPasswordError(null)
    if (data.password.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (data.password !== data.confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setPasswordError(error.message)
      return
    }
    passwordForm.reset({ password: '', confirmPassword: '' })
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Your personal login and profile details</p>
      </div>

      {/* Account */}
      <form onSubmit={accountForm.handleSubmit(onSaveAccount)} className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Profile</h2>

        {accountError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
            {accountError}
          </div>
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
          <div>
            <label className="label">Role</label>
            <input className="input-field bg-gray-50 text-gray-500" value={roleLabel(profile?.role)} disabled />
          </div>
        </div>

        <button type="submit" disabled={accountForm.formState.isSubmitting} className="btn-primary text-sm">
          Save Profile
        </button>
      </form>

      {/* Password */}
      <form onSubmit={passwordForm.handleSubmit(onSavePassword)} className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Change Password</h2>

        {passwordError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
            {passwordError}
          </div>
        )}
        {passwordSaved && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
            <CheckCircle size={16} />
            Password updated
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input-field" {...passwordForm.register('password')} />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" className="input-field" {...passwordForm.register('confirmPassword')} />
          </div>
        </div>

        <button type="submit" disabled={passwordForm.formState.isSubmitting} className="btn-primary text-sm">
          Update Password
        </button>
      </form>
    </div>
  )
}
