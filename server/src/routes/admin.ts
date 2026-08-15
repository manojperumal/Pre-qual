import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

async function requireMojoAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_mojo_admin')
    .eq('id', userId)
    .single()
  return !!data?.is_mojo_admin
}

const impersonateSchema = z.object({ company_id: z.string().uuid() })

/**
 * POST /api/admin/impersonate
 * Mojo-admin only. Mints a one-time login token for the target company's
 * admin so the caller can view/act exactly as that company would, with
 * every action correctly attributed to that company's own admin account.
 */
router.post('/impersonate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const isMojoAdmin = await requireMojoAdmin(req.userId!)
  if (!isMojoAdmin) {
    res.status(403).json({ error: 'Mojo admin access required' })
    return
  }

  const parsed = impersonateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'company_id is required' })
    return
  }

  const { company_id } = parsed.data

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('id, name, type')
    .eq('id', company_id)
    .single()

  if (companyErr || !company) {
    res.status(404).json({ error: 'Company not found' })
    return
  }

  const { data: targetAdmin, error: adminErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name')
    .eq('new_company_id', company_id)
    .eq('user_role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (adminErr || !targetAdmin?.email) {
    res.status(404).json({ error: 'This company has no admin account to view as' })
    return
  }

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetAdmin.email,
  })

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[admin] generateLink error:', linkErr)
    res.status(500).json({ error: 'Failed to create impersonation session' })
    return
  }

  res.json({
    company: { id: company.id, name: company.name, type: company.type },
    admin: { id: targetAdmin.id, email: targetAdmin.email, full_name: targetAdmin.full_name },
    hashed_token: linkData.properties.hashed_token,
  })
})

/**
 * POST /api/admin/billing/mark-project-paid
 * Mojo-admin only. Manually records a project's one-time processing fee
 * as paid — for handling payment outside QuickBooks (check, wire, etc.).
 */
const markProjectPaidSchema = z.object({
  project_id: z.string().uuid(),
  company_id: z.string().uuid(),
  amount_cents: z.number().int().nonnegative().default(0),
})

router.post('/billing/mark-project-paid', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireMojoAdmin(req.userId!))) {
    res.status(403).json({ error: 'Mojo admin access required' })
    return
  }

  const parsed = markProjectPaidSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { project_id, company_id, amount_cents } = parsed.data

  const { error } = await supabaseAdmin
    .from('project_submission_payments')
    .upsert(
      { project_id, company_id, amount_cents, status: 'paid', paid_at: new Date().toISOString() },
      { onConflict: 'project_id,company_id' }
    )

  if (error) {
    console.error('[admin] mark-project-paid error:', error)
    res.status(500).json({ error: 'Failed to record payment' })
    return
  }

  res.json({ success: true })
})

/**
 * POST /api/admin/billing/activate-subscription
 * Mojo-admin only. Manually activates a company's platform-wide annual
 * subscription — for handling payment outside QuickBooks (check, wire, etc.).
 */
const activateSubscriptionSchema = z.object({
  company_id: z.string().uuid(),
  months: z.number().int().positive().default(12),
})

router.post('/billing/activate-subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireMojoAdmin(req.userId!))) {
    res.status(403).json({ error: 'Mojo admin access required' })
    return
  }

  const parsed = activateSubscriptionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { company_id, months } = parsed.data
  const periodEnd = new Date()
  periodEnd.setMonth(periodEnd.getMonth() + months)

  const { error } = await supabaseAdmin.from('subscriptions').insert({
    company_id,
    plan: 'annual',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: periodEnd.toISOString(),
  })

  if (error) {
    console.error('[admin] activate-subscription error:', error)
    res.status(500).json({ error: 'Failed to activate subscription' })
    return
  }

  res.json({ success: true })
})

export default router
