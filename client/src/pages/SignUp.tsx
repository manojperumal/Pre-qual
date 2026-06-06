import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Building2, HardHat } from 'lucide-react'
import { UserRole } from '@/types'
import { MojoLogo } from '@/components/MojoLogo'
import clsx from 'clsx'

const API_URL = import.meta.env.VITE_API_URL || ''

const schema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  company_name: z.string().min(2, 'Company name is required'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  role: z.enum(['owner', 'gc', 'trade'] as const),
})

type FormData = z.infer<typeof schema>

const CUSTOMER_ROLES: { value: UserRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Pre-qualify GCs and Trades for your projects',
    icon: <Building2 size={24} />,
  },
  {
    value: 'gc',
    label: 'General Contractor',
    description: 'Pre-qualify Trades and manage your subcontractors',
    icon: <HardHat size={24} />,
  },
]

export default function SignUp() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')

  // If arriving via invite link, the role will be set to 'trade' (or 'gc') by the invite
  // and the role selector is hidden — they're not buying the product
  const isInvited = !!inviteToken

  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    // Invited users default to 'trade'; direct signups default to 'owner'
    defaultValues: { role: isInvited ? 'trade' : 'owner' },
  })

  const selectedRole = watch('role')

  async function onSubmit(data: FormData) {
    setAuthError(null)
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          company_name: data.company_name,
          role: data.role,
        },
      },
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session) {
      await supabase
        .from('profiles')
        .update({ company_name: data.company_name })
        .eq('id', sessionData.session.user.id)

      const pendingToken = sessionStorage.getItem('pending_invite_token')
      if (pendingToken) {
        try {
          const res = await fetch(`${API_URL}/api/invitations/accept`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ token: pendingToken }),
          })
          sessionStorage.removeItem('pending_invite_token')
          if (res.ok) {
            const role = data.role
            navigate(role === 'owner' ? '/owner' : role === 'gc' ? '/gc' : '/trade')
            return
          }
        } catch {
          // fall through
        }
      }
    }

    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <MojoLogo size="lg" subtitle="Pre-Qualification Platform" />
        </div>

        <div className="card p-8 rounded-xl shadow-xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Create your account</h2>
          <p className="text-sm text-gray-500 mb-6">
            {isInvited
              ? "You've been invited to join the platform."
              : 'Join as a paying customer to manage your pre-qualification process.'}
          </p>

          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Role selector — only shown for direct signups (not invited users) */}
            {!isInvited && (
              <div>
                <label className="label">I am a...</label>
                <div className="grid grid-cols-2 gap-3">
                  {CUSTOMER_ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setValue('role', r.value, { shouldValidate: true })}
                      className={clsx(
                        'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-colors',
                        selectedRole === r.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      )}
                    >
                      <span className={selectedRole === r.value ? 'text-brand-600' : 'text-gray-400'}>
                        {r.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{r.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Trades are added to the platform by invitation only.
                </p>
                {errors.role && <p className="form-error">{errors.role.message}</p>}
              </div>
            )}

            {/* Invited user — show role badge instead */}
            {isInvited && (
              <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-100 rounded-lg text-sm text-brand-700">
                <HardHat size={16} />
                Joining as an invited contractor
              </div>
            )}

            <div>
              <label className="label" htmlFor="full_name">Full Name</label>
              <input id="full_name" type="text" autoComplete="name" className="input-field" placeholder="Jane Smith" {...register('full_name')} />
              {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="company_name">Company Name</label>
              <input id="company_name" type="text" className="input-field" placeholder="Acme Construction LLC" {...register('company_name')} />
              {errors.company_name && <p className="form-error">{errors.company_name.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="email">Email Address</label>
              <input id="email" type="email" autoComplete="email" className="input-field" placeholder="you@company.com" {...register('email')} />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field pr-10"
                  placeholder="At least 8 characters"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2">
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
