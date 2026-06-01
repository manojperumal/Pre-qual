import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { HardHat, Eye, EyeOff, Building2, Wrench } from 'lucide-react'
import { UserRole } from '@/types'
import clsx from 'clsx'

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

const ROLES: { value: UserRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Pre-qualify GCs and Trades for your projects',
    icon: <Building2 size={20} />,
  },
  {
    value: 'gc',
    label: 'General Contractor',
    description: 'Pre-qualify for Owners and manage Trade subs',
    icon: <HardHat size={20} />,
  },
  {
    value: 'trade',
    label: 'Trade',
    description: 'Complete pre-qualification forms for Owners & GCs',
    icon: <Wrench size={20} />,
  },
]

export default function SignUp() {
  const navigate = useNavigate()
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
    defaultValues: { role: 'trade' },
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
    } else {
      // Update the profile with company_name (the trigger sets full_name and role)
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session) {
        await supabase
          .from('profiles')
          .update({ company_name: data.company_name })
          .eq('id', sessionData.session.user.id)
      }
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-brand-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <HardHat size={32} className="text-brand-400" />
            <span className="text-white font-bold text-2xl">PreQual Pro</span>
          </div>
          <p className="text-gray-400 text-sm">Create your account</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Join PreQual Pro</h2>

          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role selection */}
            <div>
              <label className="label">I am a...</label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setValue('role', r.value, { shouldValidate: true })}
                    className={clsx(
                      'flex flex-col items-center gap-2 p-3 rounded-lg border-2 text-center transition-colors',
                      selectedRole === r.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    )}
                  >
                    {r.icon}
                    <span className="text-xs font-medium">{r.label}</span>
                  </button>
                ))}
              </div>
              {selectedRole && (
                <p className="mt-1 text-xs text-gray-500">
                  {ROLES.find((r) => r.value === selectedRole)?.description}
                </p>
              )}
              {errors.role && <p className="form-error">{errors.role.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="full_name">Full Name</label>
              <input
                id="full_name"
                type="text"
                autoComplete="name"
                className="input-field"
                placeholder="Jane Smith"
                {...register('full_name')}
              />
              {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="company_name">Company Name</label>
              <input
                id="company_name"
                type="text"
                className="input-field"
                placeholder="Acme Construction LLC"
                {...register('company_name')}
              />
              {errors.company_name && (
                <p className="form-error">{errors.company_name.message}</p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input-field"
                placeholder="you@company.com"
                {...register('email')}
              />
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full mt-2"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
