import { Router, Request, Response } from 'express'
import express from 'express'
import Stripe from 'stripe'
import { supabaseAdmin } from '../lib/supabase.js'
import { stripe, STRIPE_WEBHOOK_SECRET, PROJECT_FEE_CENTS } from '../lib/stripe.js'

const router = Router()

/**
 * POST /api/stripe/webhook
 * Source of truth for payment/subscription state — never trust the browser
 * redirect alone. Needs the raw request body to verify Stripe's signature,
 * so this route must be mounted before the global express.json() middleware.
 */
router.post('/', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature']

  if (!STRIPE_WEBHOOK_SECRET || !signature) {
    res.status(400).json({ error: 'Webhook not configured' })
    return
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('[stripe webhook] signature verification failed:', err.message)
    res.status(400).json({ error: `Webhook signature verification failed` })
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { type, project_id, company_id } = session.metadata ?? {}

        if (type === 'project' && project_id && company_id) {
          await supabaseAdmin
            .from('project_submission_payments')
            .upsert(
              {
                project_id,
                company_id,
                amount_cents: session.amount_total ?? PROJECT_FEE_CENTS,
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id:
                  typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
              },
              { onConflict: 'project_id,company_id' }
            )
        } else if (type === 'annual' && company_id) {
          const periodEnd = new Date()
          periodEnd.setFullYear(periodEnd.getFullYear() + 1)
          await supabaseAdmin.from('subscriptions').insert({
            company_id,
            plan: 'annual',
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: periodEnd.toISOString(),
            stripe_subscription_id:
              typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
          })
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const status =
          subscription.status === 'active'
            ? 'active'
            : subscription.status === 'past_due'
              ? 'past_due'
              : 'canceled'
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      default:
        break
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[stripe webhook] handler error:', err)
    res.status(500).json({ error: 'Webhook handler failed' })
  }
})

export default router
