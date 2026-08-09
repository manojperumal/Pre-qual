import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { stripe, STRIPE_PRICE_ID_PROJECT, STRIPE_PRICE_ID_ANNUAL } from '../lib/stripe.js'

const router = Router()

async function getOrCreateStripeCustomer(companyId: string): Promise<string> {
  const { data: company, error } = await supabaseAdmin
    .from('companies')
    .select('id, name, stripe_customer_id')
    .eq('id', companyId)
    .single()
  if (error || !company) throw new Error('Company not found')
  if (company.stripe_customer_id) return company.stripe_customer_id

  const customer = await stripe.customers.create({
    name: company.name,
    metadata: { company_id: companyId },
  })

  await supabaseAdmin.from('companies').update({ stripe_customer_id: customer.id }).eq('id', companyId)
  return customer.id
}

/**
 * POST /api/checkout/project
 * Creates a Checkout Session for the one-time per-project processing fee.
 */
const projectCheckoutSchema = z.object({
  project_id: z.string().uuid(),
  return_url: z.string().url(),
})

router.post('/project', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = projectCheckoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'project_id and return_url are required' })
    return
  }
  const { project_id, return_url } = parsed.data

  if (!STRIPE_PRICE_ID_PROJECT) {
    res.status(500).json({ error: 'Stripe is not configured yet (missing STRIPE_PRICE_ID_PROJECT)' })
    return
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('new_company_id')
    .eq('id', req.userId!)
    .single()

  const companyId = profile?.new_company_id
  if (!companyId) {
    res.status(400).json({ error: 'No company found for this account' })
    return
  }

  // Already paid? Don't charge twice.
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
    const customerId = await getOrCreateStripeCustomer(companyId)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID_PROJECT, quantity: 1 }],
      metadata: { type: 'project', project_id, company_id: companyId },
      success_url: `${return_url}${return_url.includes('?') ? '&' : '?'}payment=success`,
      cancel_url: `${return_url}${return_url.includes('?') ? '&' : '?'}payment=cancelled`,
    })
    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] project session error:', err)
    res.status(500).json({ error: 'Failed to start checkout' })
  }
})

/**
 * POST /api/checkout/subscription
 * Creates a Checkout Session for the platform-wide annual subscription.
 */
const subscriptionCheckoutSchema = z.object({
  return_url: z.string().url(),
})

router.post('/subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = subscriptionCheckoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'return_url is required' })
    return
  }
  const { return_url } = parsed.data

  if (!STRIPE_PRICE_ID_ANNUAL) {
    res.status(500).json({ error: 'Stripe is not configured yet (missing STRIPE_PRICE_ID_ANNUAL)' })
    return
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('new_company_id')
    .eq('id', req.userId!)
    .single()

  const companyId = profile?.new_company_id
  if (!companyId) {
    res.status(400).json({ error: 'No company found for this account' })
    return
  }

  try {
    const customerId = await getOrCreateStripeCustomer(companyId)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID_ANNUAL, quantity: 1 }],
      metadata: { type: 'annual', company_id: companyId },
      success_url: `${return_url}${return_url.includes('?') ? '&' : '?'}payment=success`,
      cancel_url: `${return_url}${return_url.includes('?') ? '&' : '?'}payment=cancelled`,
    })
    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] subscription session error:', err)
    res.status(500).json({ error: 'Failed to start checkout' })
  }
})

export default router
