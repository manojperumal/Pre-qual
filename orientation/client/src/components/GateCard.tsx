import { useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, ShieldAlert, ShieldCheck, UserX, XCircle } from 'lucide-react'
import { mediaUrl, staffApi } from '@/lib/api'
import { fmtDate, fmtDateTime, REVOKE_CATEGORY_LABEL, type Status } from '@/lib/status'
import { ErrorNote, StatusBadge } from './ui'

export interface Card {
  id: string
  project_id: string
  project_name: string
  full_name: string
  company_name: string | null
  trade: string | null
  crew: string | null
  effective_status: Status
  expires_at: string | null
  identity_verified: boolean
  identity_verified_at?: string | null
  revoke_kind?: string | null
  revoke_category?: string | null
  photo_url: string | null
  checked_at: string
  wrong_project?: boolean
}

/**
 * The gate verification view (FR-13): photo, name, company, trade, project and
 * clearance status in one glance, with first-arrival photo match and
 * revoke/suspend actions (FR-16) for authorized roles.
 */
export function GateCard({ card, canRevoke, onChange }: { card: Card; canRevoke: boolean; onChange: (c: Card) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [revoking, setRevoking] = useState(false)
  const [form, setForm] = useState({ kind: 'suspended', category: 'safety_violation', reason: '' })

  const s = card.effective_status
  const ok = s === 'cleared'
  const needsMatch = s === 'pending_verification'
  const banner = ok
    ? { cls: 'bg-green-600', icon: <ShieldCheck className="h-10 w-10" />, text: 'CLEARED — OK TO ENTER' }
    : needsMatch
      ? { cls: 'bg-amber-500', icon: <UserX className="h-10 w-10" />, text: 'CHECK PHOTO TO ACTIVATE' }
      : { cls: 'bg-red-600', icon: <XCircle className="h-10 w-10" />, text: 'NOT CLEARED — DO NOT ADMIT' }

  const act = async (fn: () => Promise<Card>) => {
    setBusy(true)
    setError(null)
    try {
      onChange({ ...card, ...(await fn()) })
      setRevoking(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className={clsx('flex items-center gap-3 px-5 py-4 text-white', banner.cls)}>
        {banner.icon}
        <div>
          <p className="text-xl font-extrabold tracking-wide">{banner.text}</p>
          <p className="text-sm opacity-90">Checked {fmtDateTime(card.checked_at)}</p>
        </div>
      </div>
      {card.wrong_project && (
        <p className="flex items-center gap-2 bg-red-50 px-5 py-2 text-sm font-semibold text-red-800">
          <ShieldAlert className="h-4 w-4" /> This pass is for {card.project_name}, not this project.
        </p>
      )}
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        {card.photo_url ? (
          <img src={mediaUrl(card.photo_url)!} alt={`Photo of ${card.full_name}`} className="h-48 w-48 shrink-0 rounded-xl border object-cover" />
        ) : (
          <div className="grid h-48 w-48 shrink-0 place-items-center rounded-xl border bg-gray-100 text-sm text-gray-500">No photo</div>
        )}
        <dl className="grid flex-1 grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-gray-500">Name</dt>
          <dd className="text-lg font-bold">{card.full_name}</dd>
          <dt className="text-gray-500">Company</dt>
          <dd>{card.company_name ?? '—'}</dd>
          <dt className="text-gray-500">Trade</dt>
          <dd>{card.trade ?? 'General'}</dd>
          {card.crew && (
            <>
              <dt className="text-gray-500">Crew</dt>
              <dd>{card.crew}</dd>
            </>
          )}
          <dt className="text-gray-500">Project</dt>
          <dd>{card.project_name}</dd>
          <dt className="text-gray-500">Status</dt>
          <dd>
            <StatusBadge status={s} />
          </dd>
          <dt className="text-gray-500">Expires</dt>
          <dd>{fmtDate(card.expires_at)}</dd>
          <dt className="text-gray-500">Photo match</dt>
          <dd>{card.identity_verified ? `Verified ${fmtDateTime(card.identity_verified_at)}` : 'Not yet verified'}</dd>
          {card.revoke_category && (
            <>
              <dt className="text-gray-500">Reason</dt>
              <dd className="font-semibold text-red-700">{REVOKE_CATEGORY_LABEL[card.revoke_category] ?? card.revoke_category}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="space-y-3 border-t bg-gray-50 px-5 py-4">
        <ErrorNote error={error} />
        {needsMatch && card.photo_url && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary bg-green-600 hover:bg-green-700" disabled={busy} onClick={() => act(() => staffApi.post(`/enrollments/${card.id}/verify-identity`, { match: true }))}>
              <CheckCircle2 className="h-4 w-4" /> Photo matches — activate clearance
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => act(() => staffApi.post(`/enrollments/${card.id}/verify-identity`, { match: false }).then(() => card))}>
              Does not match
            </button>
          </div>
        )}
        {canRevoke && !revoking && (s === 'revoked' || s === 'suspended') && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt('Reason for reinstating this clearance (logged):')
              if (reason && reason.trim().length >= 3) act(() => staffApi.post(`/enrollments/${card.id}/reinstate`, { reason }))
            }}
          >
            Reinstate
          </button>
        )}
        {canRevoke && !revoking && s !== 'revoked' && s !== 'suspended' && (
          <button className="text-sm font-medium text-red-700 hover:underline" onClick={() => setRevoking(true)}>
            Revoke or suspend clearance…
          </button>
        )}
        {revoking && (
          <form
            className="grid gap-2 sm:grid-cols-[auto,auto,1fr,auto]"
            onSubmit={(e) => {
              e.preventDefault()
              act(() => staffApi.post(`/enrollments/${card.id}/revoke`, form))
            }}
          >
            <select className="input-field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="suspended">Suspend</option>
              <option value="revoked">Revoke</option>
            </select>
            <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(REVOKE_CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="input-field" placeholder="Reason (required, logged)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required minLength={3} />
            <div className="flex gap-2">
              <button className="btn-danger" disabled={busy}>
                Confirm
              </button>
              <button type="button" className="btn-secondary" onClick={() => setRevoking(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
