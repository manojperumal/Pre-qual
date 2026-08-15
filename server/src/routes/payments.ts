import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { chargeCard } from '../lib/quickbooks.js'

const router = Router()

const PROJECT_FEE_CENTS = 15000
const ANNUAL_FEE_CENTS = 45000

async function getCompanyId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin.from('profiles').select('new_company_id').eq('id', userId).single()
  return profile?.new_company_id ?? null
}

/**
 * POST /api/payments/project
 * Charges the one-time per-project processing fee via a QuickBooks Payments
 * card token generated client-side (see client/src/lib/quickbooks.ts).
 * Unlike the old Stripe Checkout flow this is synchronous — no redirect,
 * no webhook to wait on — so the payment row is written directly here.
 */
const projectPaymentSchema = z.object({
  project_id: z.string().uuid(),
  payment_token: z.string().min(1),
})

router.post('/project', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = projectPaymentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'project_id and payment_token are required' })
    return
  }
  const { project_id, payment_token } = parsed.data

  const companyId = await getCompanyId(req.userId!)
  if (!companyId) {
    res.status(400).json({ error: 'No company found for this account' })
    return
  }

  const { data: existingPayment } = await supabaseAdmin
    .from('project_submission_payments')
    .select('status')
    .eq('project_id', project_id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (existingPayment?.status === 'paid') {
    res.status(400).json({ error: 'This project has already been paid for' })
    return
  }

  try {
    const charge = await chargeCard({ amountCents: PROJECT_FEE_CENTS, currency: 'usd', token: payment_token })

    await supabaseAdmin.from('project_submission_payments').upsert(
      {
        project_id,
        company_id: companyId,
        amount_cents: PROJECT_FEE_CENTS,
        status: 'paid',
        paid_at: new Date().toISOString(),
        quickbooks_payment_id: charge.paymentId,
      },
      { onConflict: 'project_id,company_id' }
    )

    res.json({ success: true })
  } catch (err: any) {
    console.error('[payments] project charge error:', err)
    res.status(500).json({ error: 'Payment failed. Please check your card details and try again.' })
  }
})

/**
 * POST /api/payments/subscription
 * Charges the platform-wide annual fee. QuickBooks Payments doesn't manage
 * recurring billing the way Stripe Subscriptions did — this only records a
 * one-year active period from today. Auto-renewal would need a scheduled
 * job to re-charge the stored token/customer before current_period_end;
 * that's not wired up yet.
 */
const subscriptionPaymentSchema = z.object({
  payment_token: z.string().min(1),
})

router.post('/subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = subscriptionPaymentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'payment_token is required' })
    return
  }
  const { payment_token } = parsed.data

  const companyId = await getCompanyId(req.userId!)
  if (!companyId) {
    res.status(400).json({ error: 'No company found for this account' })
    return
  }

  try {
    const charge = await chargeCard({ amountCents: ANNUAL_FEE_CENTS, currency: 'usd', token: payment_token })

    const periodEnd = new Date()
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    await supabaseAdmin.from('subscriptions').insert({
      company_id: companyId,
      plan: 'annual',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
      quickbooks_recurring_id: charge.paymentId,
    })

    res.json({ success: true })
  } catch (err: any) {
    console.error('[payments] subscription charge error:', err)
    res.status(500).json({ error: 'Payment failed. Please check your card details and try again.' })
  }
})

export default router
