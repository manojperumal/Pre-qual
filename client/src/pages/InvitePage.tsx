import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import QRCode from 'react-qr-code'
import { useAuth } from '@/hooks/useAuth'
import { useSendInvitation, useSentInvitations } from '@/hooks/usePrequals'
import { useProjects, useMyProjects } from '@/hooks/useProjects'
import { StatusBadge } from '@/components/StatusBadge'
import { Send, Users, HardHat, Wrench, ChevronRight, QrCode, Copy, Check, X, Mail, UserPlus } from 'lucide-react'
import { format } from 'date-fns'

const schema = z.object({
  recipient_email: z.string().email('Enter a valid email address').or(z.literal('')),
  recipient_role: z.enum(['gc', 'trade', 'gc_member', 'owner_member', 'trade_member'] as const),
  recipient_company_name: z.string().optional(),
  project_ids: z.array(z.string()).optional(),
  intended_user_role: z.enum(['admin', 'contributor']).default('contributor'),
})

type FormData = z.infer<typeof schema>
type RecipientRole = FormData['recipient_role']

type Tab = 'email' | 'qr'

const ROLE_META: Record<RecipientRole, { heading: string; icon: React.ReactNode }> = {
  gc: { heading: 'Invite a General Contractor', icon: <HardHat size={22} /> },
  trade: { heading: 'Invite a Trade Subcontractor', icon: <Wrench size={22} /> },
  gc_member: { heading: 'Invite a Team Member', icon: <UserPlus size={22} /> },
  owner_member: { heading: 'Invite a Team Member', icon: <UserPlus size={22} /> },
  trade_member: { heading: 'Invite a Team Member', icon: <UserPlus size={22} /> },
}

export default function InvitePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
  const [searchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<Tab>('email')
  const [qrInviteUrl, setQrInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [qrError, setQrError] = useState<string | null>(null)

  const sendInvitation = useSendInvitation()
  const { data: invitations = [] } = useSentInvitations(profile?.id)

  const effectiveRole = profile?.company_type ?? profile?.role
  const isOwner = effectiveRole === 'owner'
  const isGC = effectiveRole === 'gc'

  // Owners own their projects; GCs are members of projects they don't own
  const { data: ownedProjects = [] } = useProjects(isOwner ? profile?.id : undefined)
  const { data: memberProjects = [] } = useMyProjects(isGC ? profile?.id : undefined)
  const projects = isOwner ? ownedProjects : memberProjects

  // The role is fixed by whichever "Invite" button the user came from
  // (Trades page -> trade, GCs page -> gc, My Team -> *_member) — no in-page switcher.
  const recipientRole = (searchParams.get('role') as RecipientRole) || (isOwner ? 'gc' : 'trade')
  const defaultEmail = searchParams.get('email') || ''
  const fromPage = searchParams.get('from') || ''
  const isMemberInvite = recipientRole.endsWith('_member')
  const isNewCompanyInvite = recipientRole === 'gc' || recipientRole === 'trade'

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
      recipient_role: recipientRole,
      recipient_email: defaultEmail,
      recipient_company_name: '',
      project_ids: routeProjectId ? [routeProjectId] : [],
      intended_user_role: 'contributor',
    },
  })

  const selectedProjectIds = watch('project_ids') ?? []
  const selectedUserRole = watch('intended_user_role')

  function toggleProject(id: string) {
    const current = new Set(selectedProjectIds)
    if (current.has(id)) current.delete(id)
    else current.add(id)
    setValue('project_ids', Array.from(current))
  }

  async function onSubmitEmail(data: FormData) {
    if (!profile?.id || !data.recipient_email) return
    const projectIds = routeProjectId ? [routeProjectId] : data.project_ids ?? []
    try {
      const result = await sendInvitation.mutateAsync({
        recipient_email: data.recipient_email,
        recipient_role: recipientRole,
        recipient_company_name: isNewCompanyInvite ? data.recipient_company_name : undefined,
        project_ids: projectIds,
        intended_user_role: isMemberInvite ? data.intended_user_role : undefined,
      })
      // Also set the QR for this invite
      const token = (result as any)?.invitation?.token || (result as any)?.token
      if (token) {
        setQrInviteUrl(`${window.location.origin}/invite/${token}`)
      }
      setSentEmail(data.recipient_email)
      setEmailSent(true)
      reset({ recipient_role: recipientRole, recipient_email: '', recipient_company_name: '', project_ids: data.project_ids, intended_user_role: data.intended_user_role })
    } catch (err) {
      console.error('Failed to send invitation', err)
    }
  }

  async function onGenerateQR(data: FormData) {
    if (!profile?.id) return
    setQrError(null)
    const projectIds = routeProjectId ? [routeProjectId] : data.project_ids ?? []
    try {
      const result = await sendInvitation.mutateAsync({
        recipient_email: `qr+${Date.now()}@placeholder.invalid`,
        recipient_role: recipientRole,
        recipient_company_name: isNewCompanyInvite ? data.recipient_company_name : undefined,
        project_ids: projectIds,
        intended_user_role: isMemberInvite ? data.intended_user_role : undefined,
      })
      const token = (result as any)?.invitation?.token || (result as any)?.token
      if (token) {
        setQrInviteUrl(`${window.location.origin}/invite/${token}`)
      } else {
        setQrError('Invitation was created, but no invite link was returned. Please try again.')
      }
    } catch (err: any) {
      console.error('Failed to generate QR', err)
      setQrError(err?.message || 'Failed to generate QR code. Please try again.')
    }
  }

  function copyLink() {
    if (!qrInviteUrl) return
    navigator.clipboard.writeText(qrInviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Breadcrumb logic
  const breadcrumbs: { label: string; to: string }[] = []
  const basePath = isOwner ? '/owner' : isGC ? '/gc' : '/trade'
  if (routeProjectId) {
    breadcrumbs.push({ label: 'Projects', to: `${basePath}/projects` })
    breadcrumbs.push({ label: 'Project', to: `${basePath}/projects/${routeProjectId}` })
  } else if (fromPage === 'general-contractors') {
    breadcrumbs.push({ label: 'General Contractors', to: '/owner/general-contractors' })
  } else if (fromPage === 'trades') {
    breadcrumbs.push({ label: 'Trades', to: `${basePath}/trades` })
  } else if (fromPage === 'my-team') {
    breadcrumbs.push({ label: 'My Team', to: `${basePath}/my-team` })
  } else {
    breadcrumbs.push({ label: 'Dashboard', to: basePath })
  }

  const recentInvitations = (
    routeProjectId
      ? invitations.filter((inv) => (inv.invitation_projects ?? []).some((ip) => ip.project.id === routeProjectId))
      : invitations
  ).filter((inv) => inv.recipient_role === recipientRole)

  const { heading, icon } = ROLE_META[recipientRole]

  function ProjectPicker() {
    if (routeProjectId || isMemberInvite) return null
    return (
      <div>
        <label className="label">
          Attach to Project(s) <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        {projects.length === 0 ? (
          <p className="text-xs text-gray-400">No projects yet — they'll be added to your ecosystem and you can connect them to a project later.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedProjectIds.includes(p.id)}
                  onChange={() => toggleProject(p.id)}
                  className="rounded border-gray-300"
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-gray-400">
          Leave unchecked to add them to your ecosystem without connecting a project yet.
        </p>
      </div>
    )
  }

  function RoleAtCompanyField() {
    if (!isMemberInvite) return null
    return (
      <div>
        <label className="label">Role in Your Company</label>
        <div className="grid grid-cols-2 gap-3">
          {(['admin', 'contributor'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setValue('intended_user_role', r)}
              className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-colors ${
                selectedUserRole === r
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <span className="text-sm font-medium">{r === 'admin' ? 'Admin' : 'Contributor'}</span>
              <span className="text-xs text-gray-500">
                {r === 'admin' ? 'Full access to all projects and company settings' : 'Access limited to assigned projects'}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  function CompanyNameField() {
    if (!isNewCompanyInvite) return null
    return (
      <div>
        <label className="label" htmlFor="recipient_company_name">
          {recipientRole === 'gc' ? 'GC' : 'Trade'} Company Name *
        </label>
        <input
          id="recipient_company_name"
          type="text"
          className="input-field"
          placeholder="Acme Electrical LLC"
          {...register('recipient_company_name')}
        />
      </div>
    )
  }

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

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 flex-shrink-0">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isMemberInvite
              ? 'Invite a colleague to join your company on the platform'
              : 'Send an email invite or generate a QR code to share in person'}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'email' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mail size={15} />
          Email Invite
        </button>
        <button
          onClick={() => setActiveTab('qr')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'qr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <QrCode size={15} />
          QR Code
        </button>
      </div>

      {/* Email invite tab */}
      {activeTab === 'email' && (
        <div className="space-y-4">
          {emailSent && (
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
              <Check size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Invitation sent!</p>
                <p className="text-sm text-green-700">Email sent to <strong>{sentEmail}</strong></p>
                {qrInviteUrl && (
                  <button
                    onClick={() => { setActiveTab('qr'); setEmailSent(false) }}
                    className="mt-2 text-sm text-green-700 underline hover:text-green-900"
                  >
                    View QR code for this invite →
                  </button>
                )}
              </div>
              <button onClick={() => setEmailSent(false)} className="text-green-500 hover:text-green-700">
                <X size={16} />
              </button>
            </div>
          )}

          {sendInvitation.isError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              Failed to send invitation. Please try again.
            </div>
          )}

          <div className="card p-6">
            <form onSubmit={handleSubmit(onSubmitEmail)} className="space-y-5">
              <CompanyNameField />
              <RoleAtCompanyField />
              <ProjectPicker />

              <div>
                <label className="label" htmlFor="recipient_email">Recipient Email Address *</label>
                <input
                  id="recipient_email"
                  type="email"
                  className="input-field"
                  placeholder="contractor@company.com"
                  {...register('recipient_email')}
                />
                {errors.recipient_email && <p className="form-error">{errors.recipient_email.message}</p>}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
                <button
                  type="submit"
                  disabled={isSubmitting || sendInvitation.isPending}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Send size={16} />
                  {isSubmitting || sendInvitation.isPending ? 'Sending…' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR code tab */}
      {activeTab === 'qr' && (
        <div className="space-y-4">
          <div className="card p-6 space-y-5">
            <CompanyNameField />
            <RoleAtCompanyField />
            <ProjectPicker />

            {qrError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {qrError}
              </div>
            )}

            {!qrInviteUrl ? (
              <div className="text-center py-6">
                <QrCode size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-sm text-gray-500 mb-4">Generate a QR code to share in person.<br />The recipient scans it, then enters their own email to complete signup.</p>
                <button
                  onClick={handleSubmit(onGenerateQR)}
                  disabled={sendInvitation.isPending}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <QrCode size={16} />
                  {sendInvitation.isPending ? 'Generating…' : 'Generate QR Code'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 py-4">
                <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
                  <QRCode value={qrInviteUrl} size={200} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">{heading}</p>
                  <p className="text-xs text-gray-400 mt-1">Scan to create an account and join the platform</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={copyLink}
                    className="btn-secondary inline-flex items-center gap-2 text-sm"
                  >
                    {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => { setQrInviteUrl(null); setQrError(null) }}
                    className="btn-secondary inline-flex items-center gap-2 text-sm"
                  >
                    <QrCode size={15} />
                    New QR Code
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                  {(isMemberInvite
                    ? ['Recipient', 'Sent', 'Status']
                    : ['Recipient', 'Project(s)', 'Sent', 'Status']
                  ).map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentInvitations.map((inv) => {
                  const invProjects = (inv.invitation_projects ?? []).map((ip) => ip.project)
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {inv.recipient_email}
                        {inv.recipient_company_name && (
                          <p className="text-xs text-gray-500 mt-0.5">{inv.recipient_company_name}</p>
                        )}
                      </td>
                      {!isMemberInvite && (
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {invProjects.length === 0 ? (
                            <span className="text-xs text-gray-400 italic">Ecosystem only</span>
                          ) : (
                            <Link to={`${basePath}/projects/${invProjects[0].id}`} className="text-brand-600 hover:text-brand-700">
                              {invProjects[0].name}
                              {invProjects.length > 1 && ` +${invProjects.length - 1} more`}
                            </Link>
                          )}
                        </td>
                      )}
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
