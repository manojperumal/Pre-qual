import { useState } from 'react'
import { useUpdateBillingMode } from '@/hooks/useBilling'
import { BillingMode } from '@/types'
import { CheckCircle, CreditCard } from 'lucide-react'

interface BillingSettingsCardProps {
  companyId: string | null | undefined
  billingMode: BillingMode | null | undefined
  isAdmin: boolean
  /** Label for whoever gets invited by this company — "Trades" for a GC, "GCs and Trades" for an Owner */
  inviteeLabel: string
}

export function BillingSettingsCard({ companyId, billingMode, isAdmin, inviteeLabel }: BillingSettingsCardProps) {
  const { updateBillingMode, isPending, error } = useUpdateBillingModeWrapper()
  const [saved, setSaved] = useState(false)

  async function handleChange(mode: BillingMode) {
    if (!companyId) return
    await updateBillingMode({ companyId, billingMode: mode })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900">Billing</h2>
      </div>
      <p className="text-xs text-gray-500 -mt-2">Who pays for pre-qualification processing when you invite {inviteeLabel}</p>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>}
      {saved && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
          <CheckCircle size={16} />
          Saved
        </div>
      )}
      {!isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm">
          Only company admins can change this.
        </div>
      )}

      <fieldset disabled={!isAdmin || isPending} className="grid grid-cols-1 gap-3 disabled:opacity-60">
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 border-gray-200">
          <input
            type="radio"
            className="mt-1"
            checked={billingMode === 'pays_all' || !billingMode}
            onChange={() => handleChange('pays_all')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">We pay for everyone</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              You cover the processing cost for every {inviteeLabel} you invite — they never see a bill.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 border-gray-200">
          <input
            type="radio"
            className="mt-1"
            checked={billingMode === 'platform_only'}
            onChange={() => handleChange('platform_only')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">Platform access only</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Invited companies pay for their own pre-qualification processing — a one-time fee per project, or a
              platform-wide annual subscription.
            </span>
          </span>
        </label>
      </fieldset>
    </div>
  )
}

// Small local wrapper so the card exposes a plain async function + error/pending state
function useUpdateBillingModeWrapper() {
  const mutation = useUpdateBillingMode()
  return {
    updateBillingMode: (vars: { companyId: string; billingMode: BillingMode }) => mutation.mutateAsync(vars),
    isPending: mutation.isPending,
    error: mutation.error ? (mutation.error as Error).message : null,
  }
}
