import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { roleLabel } from '@/lib/roleLabels'
import { HardHat } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

interface InviteInfo {
  recipient_email: string
  recipient_role: string
  recipient_company_name?: string | null
  project_id?: string
  projects?: { id: string; name: string }[]
  sender_name?: string
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  // Fetch invite info on mount
  useEffect(() => {
    if (!token) return
    sessionStorage.setItem('pending_invite_token', token)
    fetch(`${API_URL}/api/invitations/token/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Invitation not found or expired')
        }
        return res.json() as Promise<InviteInfo>
      })
      .then((info) => setInviteInfo(info))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingInvite(false))
  }, [token])

  // If user is already logged in, auto-accept
  useEffect(() => {
    if (authLoading || loadingInvite || !profile || !inviteInfo || !token || accepting) return
    setAccepting(true)
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const accessToken = sessionData.session?.access_token
      fetch(`${API_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || 'Failed to accept invitation')
          }
          return res.json()
        })
        .then(() => {
          sessionStorage.removeItem('pending_invite_token')
          const effectiveRole = profile.company_type ?? profile.role
          if (profile.is_mojo_admin || effectiveRole === 'owner') navigate('/owner', { replace: true })
          else if (effectiveRole === 'gc') navigate('/gc', { replace: true })
          else navigate('/trade', { replace: true })
        })
        .catch((err) => {
          setError(err.message)
          setAccepting(false)
        })
    })
  }, [authLoading, loadingInvite, profile, inviteInfo, token, accepting, navigate])

  if (loadingInvite || authLoading || accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <HardHat size={40} className="mx-auto text-gray-300" />
          <h1 className="text-xl font-semibold text-gray-900">Invitation Error</h1>
          <p className="text-sm text-red-600">{error}</p>
          <Link to="/login" className="btn-primary inline-flex mx-auto">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  if (!inviteInfo) return null

  // QR invites carry a placeholder email — the scanner must type their own
  const isQrInvite = inviteInfo.recipient_email.endsWith('@placeholder.invalid')
  const projects = inviteInfo.projects ?? []

  const linkParams = new URLSearchParams({ invite: token ?? '' })
  if (!isQrInvite) linkParams.set('email', inviteInfo.recipient_email)
  linkParams.set('role', inviteInfo.recipient_role)
  if (inviteInfo.recipient_company_name) linkParams.set('company', inviteInfo.recipient_company_name)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-brand-900 px-4">
      <div className="card p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <HardHat size={40} className="mx-auto text-brand-600 mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">You're Invited!</h1>
        </div>

        <div className="bg-brand-50 border border-brand-100 rounded-lg p-4 text-sm text-brand-800 space-y-1">
          {inviteInfo.sender_name && (
            <p>
              <span className="font-medium">{inviteInfo.sender_name}</span> has invited you
            </p>
          )}
          {inviteInfo.recipient_company_name && (
            <p>
              as <span className="font-medium">{inviteInfo.recipient_company_name}</span>
            </p>
          )}
          {projects.length > 0 && (
            <p>
              to join {projects.length === 1 ? 'project' : 'projects'}{' '}
              <span className="font-medium">{projects.map((p) => p.name).join(', ')}</span>
            </p>
          )}
          <p>
            as a <span className="font-medium">{roleLabel(inviteInfo.recipient_role)}</span>
          </p>
          {isQrInvite && (
            <p className="text-brand-700 text-xs pt-1">You'll enter your own email on the next step.</p>
          )}
        </div>

        <div className="space-y-3">
          <Link to={`/signup?${linkParams.toString()}`} className="btn-primary w-full text-center block">
            Create Account & Accept
          </Link>
          <Link to={`/login?${linkParams.toString()}`} className="btn-secondary w-full text-center block">
            Sign In & Accept
          </Link>
        </div>
      </div>
    </div>
  )
}
