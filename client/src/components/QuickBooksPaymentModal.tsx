import { useState } from 'react'
import { tokenizeCard } from '@/lib/quickbooks'
import { X, CreditCard } from 'lucide-react'

interface QuickBooksPaymentModalProps {
  title: string
  amountLabel: string
  onClose: () => void
  onCharge: (paymentToken: string) => Promise<void>
}

export function QuickBooksPaymentModal({ title, amountLabel, onClose, onCharge }: QuickBooksPaymentModalProps) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [expMonth, setExpMonth] = useState('')
  const [expYear, setExpYear] = useState('')
  const [cvc, setCvc] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const token = await tokenizeCard({ name, number, expMonth, expYear, cvc, postalCode })
      await onCharge(token)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Payment failed. Please check your card details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-sm p-6 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <CreditCard size={18} className="text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">{amountLabel}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label" htmlFor="qb-name">Name on Card</label>
            <input id="qb-name" className="input-field" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="qb-number">Card Number</label>
            <input
              id="qb-number"
              className="input-field"
              required
              inputMode="numeric"
              placeholder="4111 1111 1111 1111"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="qb-exp-month">Month</label>
              <input id="qb-exp-month" className="input-field" required placeholder="MM" maxLength={2} value={expMonth} onChange={(e) => setExpMonth(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="qb-exp-year">Year</label>
              <input id="qb-exp-year" className="input-field" required placeholder="YYYY" maxLength={4} value={expYear} onChange={(e) => setExpYear(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="qb-cvc">CVC</label>
              <input id="qb-cvc" className="input-field" required maxLength={4} value={cvc} onChange={(e) => setCvc(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="qb-postal">Billing Zip</label>
            <input id="qb-postal" className="input-field" required value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Processing…' : 'Pay Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
