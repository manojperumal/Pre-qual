import { BillingMode } from '@/types'
import { CreditCard } from 'lucide-react'

interface BillingSettingsCardProps {
  billingMode: BillingMode | null | undefined
  onChange: (mode: BillingMode) => void
  /** Label for whoever gets invited by this company — "Trades" for a GC, "GCs and Trades" for an Owner */
  inviteeLabel: string
}

// Purely a controlled input — the parent page owns the pending value and
// when it actually gets saved (see MojoAdminCompanyDetailPage's single
// page-level Save button).
export function BillingSettingsCard({ billingMode, onChange, inviteeLabel }: BillingSettingsCardProps) {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900">Billing</h2>
      </div>
      <p className="text-xs text-gray-500 -mt-2">Who pays for pre-qualification processing when this company invites {inviteeLabel}</p>

      <fieldset className="grid grid-cols-1 gap-3">
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 border-gray-200">
          <input
            type="radio"
            className="mt-1"
            checked={billingMode === 'pays_all' || !billingMode}
            onChange={() => onChange('pays_all')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">They pay for everyone</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              This company covers the processing cost for every {inviteeLabel} it invites — they never see a bill.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 border-gray-200">
          <input
            type="radio"
            className="mt-1"
            checked={billingMode === 'platform_only'}
            onChange={() => onChange('platform_only')}
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
