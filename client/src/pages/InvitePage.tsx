import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useSendInvitation, useSentInvitations } from '@/hooks/usePrequals'
import { StatusBadge } from '@/components/StatusBadge'
import { Send, CheckCircle, Users, HardHat, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'

const schema = z.object({
  recipient_email: z.string().email('Enter a valid email address'),
  recipient_role: z.enum(['gc', 'trade'] as const),
})

type FormData = z.infer<typeof schema>

export default function InvitePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId?: string }>()
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  const sendInvitation = useSendInvitation()
  const { data: invitations = [] } = useSentInvitations(profile?.id)

  const isOwner = profile?.role === 'owner'

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { recipient_role: 'trade' },
  })

  const selectedRole = watch('recipient_role')

  async function onSubmit(data: FormData) {
    if (!profile?.id) return
    try {
      await sendInvitation.mutateAsync({
        recipient_email: data.recipient_email,
        recipient_role: data.recipient_role,
        project_id: projectId,
      })
      setSentEmail(data.recipient_email)
      setSent(true)
      reset()
      setTimeout(() => setSent(false), 4000)
    } catch (err: unknown) {
      console.error('Failed to send invitation', err)
    }
  }

  const backPath = profile?.role === 'owner' ? '/owner' : profile?.role === 'gc' ? '/gc' : '/trade'

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <Link to={backPath} className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Send Pre-Qual Invitation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Invite a {isOwner ? 'General Contractor or Trade' : 'Trade subcontractor'} to complete
          a pre-qualification form{projectId ? ' for this project' : ''}
        </p>
      </div>

      {/* Success alert */}
      {sent && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
          <div>
            <p className="font-medium">Invitation sent!</p>
            <p className="text-sm text-green-700">
              An email has been sent to <strong>{sentEmail}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {sendInvitation.isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Failed to send invitation. Please try again.
        </div>
      )}

      {/* Invite form */}
      <div className="card p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Role selection */}
          <div>
            <label className="label">Invite as</label>
            <div className="grid grid-cols-2 gap-3">
              {(isOwner
                ? [
                    {
                      value: 'gc' as const,
                      label: 'General Contractor',
                      icon: <HardHat size={20} />,
                    },
                    {
                      value: 'trade' as const,
                      label: 'Trade Subcontractor',
                      icon: <Wrench size={20} />,
                    },
                  ]
                : [
                    {
                      value: 'trade' as const,
                      label: 'Trade Subcontractor',
                      icon: <Wrench size={20} />,
                    },
                  ]
              ).map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setValue('recipient_role', r.value, { shouldValidate: true })}
                  className={clsx(
                    'flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-colors',
                    selectedRole === r.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  )}
                >
                  {r.icon}
                  <span className="text-sm font-medium">{r.label}</span>
                </button>
              ))}
            </div>
            {errors.recipient_role && (
              <p className="form-error">{errors.recipient_role.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="label" htmlFor="recipient_email">
              Recipient Email Address *
            </label>
            <input
              id="recipient_email"
              type="email"
              className="input-field"
              placeholder="contractor@company.com"
              {...register('recipient_email')}
            />
            {errors.recipient_email && (
              <p className="form-error">{errors.recipient_email.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              They will receive an email with a link to complete their pre-qualification.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || sendInvitation.isPending}
              className="btn-primary"
            >
              <Send size={16} className="mr-2" />
              {isSubmitting || sendInvitation.isPending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>

      {/* Recent invitations */}
      {invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Recent Invitations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Recipient', 'Role', 'Sent', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{inv.recipient_email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                      {inv.recipient_role}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(new Date(inv.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inv.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
