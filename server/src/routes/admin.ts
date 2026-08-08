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

export default router
