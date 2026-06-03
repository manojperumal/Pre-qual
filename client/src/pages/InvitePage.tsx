import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useSendInvitation, useSentInvitations } from '@/hooks/usePrequals'
import { useProjects } from '@/hooks/useProjects'
import { StatusBadge } from '@/components/StatusBadge'
import { Send, CheckCircle, Users, HardHat, Wrench, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'

const schema = z.object({
  recipient_email: z.string().email('Enter a valid email address'),
  recipient_role: z.enum(['gc', 'trade'] as const),
  project_id: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function InvitePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
  const [searchParams] = useSearchParams()
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  const sendInvitation = useSendInvitation()
  const { data: invitations = [] } = useSentInvitations(profile?.id)
  const { data: projects = [] } = useProjects(profile?.id)

  const isOwner = profile?.role === 'owner'

  // Pre-fill from query params
  const defaultRole = (searchParams.get('role') as 'gc' | 'trade') || 'gc'
  const defaultEmail = searchParams.get('email') || ''
  const fromPage = searchParams.get('from') || ''

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      recipient_role: defaultRole,
      recipient_email: defaultEmail,
      project_id: routeProjectId || '',
    },
  })

  const selectedRole = watch('recipient_role')
  const selectedProjectId = watch('project_id')

  async function onSubmit(data: FormData) {
    if (!profile?.id) return
    const projectId = routeProjectId || data.project_id || undefined
    try {
      await sendInvitation.mutateAsync({
        recipient_email: data.recipient_email,
        recipient_role: data.recipient_role,
        project_id: projectId,
      })
      setSentEmail(data.recipient_email)
      setSent(true)
      reset({
        recipient_role: data.recipient_role,
        recipient_email: '',
        project_id: data.project_id,
      })
      setTimeout(() => setSent(false), 4000)
    } catch (err: unknown) {
      console.error('Failed to send invitation', err)
    }
  }

  // Breadcrumb logic
  const breadcrumbs: { label: string; to: string }[] = []
  if (routeProjectId) {
    breadcrumbs.push({ label: 'Projects', to: '/owner/projects' })
    breadcrumbs.push({ label: 'Project', to: `/owner/projects/${routeProjectId}` })
  } else if (fromPage === 'general-contractors') {
    breadcrumbs.push({ label: 'General Contractors', to: '/owner/general-contractors' })
  } else if (fromPage === 'trades') {
    breadcrumbs.push({ label: 'Trades', to: '/owner/trades' })
  } else {
    breadcrumbs.push({ label: 'Dashboard', to: '/owner' })
  }

  const recentInvitations = routeProjectId
    ? invitations.filter((inv) => (inv as any).project_id === routeProjectId)
    : invitations

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        {breadcrumbs.map((b, i) => (
          <span key={b.to} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="text-gray-400" />}
            <Link to={b.to} className="hover:text-brand-600 transition-colors">{b.label}</Link>
          </span>
        ))}
        <ChevronRight size={14} className="text-gray-400" />
        <span className="text-gray-900 font-medium">Invite</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Send Pre-Qual Invitation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Invite a {isOwner ? 'General Contractor or Trade' : 'Trade subcontractor'} to complete
          a pre-qualification form{routeProjectId ? ' for this project' : ''}
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

      {sendInvitation.isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Failed to send invitation. Please try again.
        </div>
      )}

      {/* Invite form */}
      <div className="card p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Role selection — only show for owners */}
          {isOwner && (
            <div>
              <label className="label">Invite as</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'gc' as const, label: 'General Contractor', icon: <HardHat size={20} /> },
                  { value: 'trade' as const, label: 'Trade Subcontractor', icon: <Wrench size={20} /> },
                ].map((r) => (
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
            </div>
          )}

          {/* Project selector — only when not coming from a project route */}
          {!routeProjectId && isOwner && (
            <div>
              <label className="label" htmlFor="project_id">
                Attach to Project <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="project_id"
                className="input-field"
                {...register('project_id')}
              >
                <option value="">— No project selected —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                The invitee will be added as a member of this project when they accept.
              </p>
            </div>
          )}

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
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || sendInvitation.isPending}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Send size={16} />
              {isSubmitting || sendInvitation.isPending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>

      {/* Recent invitations */}
      {recentInvitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Recent Invitations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Recipient', 'Role', 'Project', 'Sent', 'Status'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentInvitations.map((inv) => {
                  const project = projects.find((p) => p.id === (inv as any).project_id)
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{inv.recipient_email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">{inv.recipient_role}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {project ? (
                          <Link to={`/owner/projects/${project.id}`} className="text-brand-600 hover:text-brand-700">
                            {project.name}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {format(new Date(inv.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={inv.status} size="sm" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
