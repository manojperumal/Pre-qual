import { Router, Request, Response } from 'express'
import nodemailer from 'nodemailer'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

// Create nodemailer transporter (returns null if SMTP not configured)
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[invitations] SMTP env vars missing: SMTP_HOST, SMTP_USER, SMTP_PASS must all be set')
    return null
  }
  const port = Number(process.env.SMTP_PORT) || 465
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const sendSchema = z.object({
  recipient_email: z.string().email(),
  recipient_role: z.enum(['gc', 'trade', 'gc_member', 'owner_member', 'trade_member']),
  recipient_company_name: z.string().trim().min(1).optional(),
  project_ids: z.array(z.string().uuid()).optional(),
})

/**
 * GET /api/invitations/smtp-check
 * Debug endpoint — verifies SMTP env vars are present and connection works.
 */
router.get('/smtp-check', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const vars = {
    SMTP_HOST: process.env.SMTP_HOST || '(not set)',
    SMTP_PORT: process.env.SMTP_PORT || '(not set, defaults to 465)',
    SMTP_USER: process.env.SMTP_USER ? '(set)' : '(not set)',
    SMTP_PASS: process.env.SMTP_PASS ? '(set)' : '(not set)',
    FROM_EMAIL: process.env.FROM_EMAIL || '(not set)',
  }
  const transporter = createTransporter()
  if (!transporter) {
    res.json({ ok: false, reason: 'SMTP env vars missing', vars })
    return
  }
  try {
    await transporter.verify()
    res.json({ ok: true, message: 'SMTP connection verified', vars })
  } catch (err: any) {
    res.json({ ok: false, reason: err.message, vars })
  }
})

/**
 * POST /api/invitations/send
 * Creates an invitation record with a token and sends an email.
 * Requires auth.
 */
router.post('/send', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { recipient_email, recipient_role, recipient_company_name, project_ids } = parsed.data
  const senderId = req.userId!

  // Generate a secure token
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch sender profile + company name
  const { data: sender } = await supabaseAdmin
    .from('profiles')
    .select('full_name, company_name, email, company:companies!new_company_id(name)')
    .eq('id', senderId)
    .single()

  // Fetch project names if any project_ids provided
  let projectNames: string[] = []
  if (project_ids?.length) {
    const { data: projectRows } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .in('id', project_ids)
    projectNames = (projectRows ?? []).map((p) => p.name)
  }

  // Insert invitation record (store gc_member as-is in recipient_role).
  // project_id keeps the first attached project for backward-compat display;
  // the full set (including zero or many) lives in invitation_projects.
  const { data: invitation, error: insertErr } = await supabaseAdmin
    .from('invitations')
    .insert({
      sender_id: senderId,
      recipient_email,
      recipient_role,
      recipient_company_name: recipient_company_name ?? null,
      project_id: project_ids?.[0] ?? null,
      token,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select()
    .single()

  if (insertErr || !invitation) {
    console.error('[invitations] Insert error:', insertErr)
    res.status(500).json({ error: 'Failed to create invitation' })
    return
  }

  if (project_ids?.length) {
    const { error: linkErr } = await supabaseAdmin
      .from('invitation_projects')
      .insert(project_ids.map((project_id) => ({ invitation_id: invitation.id, project_id })))
    if (linkErr) {
      console.error('[invitations] Failed to link projects:', linkErr)
    }
  }

  const senderName = (sender as any)?.company?.name || (sender as any)?.company_name || (sender as any)?.full_name || 'A construction company'
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const inviteLink = `${clientUrl}/invite/${token}`
  const recipientRoleLabel =
    recipient_role === 'gc' ? 'General Contractor' :
    recipient_role === 'trade' ? 'Trade Subcontractor' :
    'Team Member'
  const projectLine = projectNames.length
    ? ` for ${projectNames.length === 1 ? 'the project' : 'the projects'} <strong>${projectNames.join(', ')}</strong>`
    : ''

  // Send email or log to console
  const transporter = createTransporter()
  if (!transporter) {
    console.log(`[invitations] SMTP not configured. Invite link: ${inviteLink}`)
    res.json({ success: true, message: 'Invitation created (email not sent — SMTP not configured)', invitation })
    return
  }

  try {
    await transporter.sendMail({
      from: `"PreQual Pro" <${process.env.FROM_EMAIL || 'noreply@prequalpro.com'}>`,
      to: recipient_email,
      subject: `You've been invited to join ${senderName} on PreQual Pro`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #111827; background: #f9fafb; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
            .header { background: #1e40af; color: white; padding: 24px 32px; }
            .header h1 { margin: 0; font-size: 20px; }
            .body { padding: 32px; }
            .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 16px; }
            .footer { padding: 16px 32px; background: #f3f4f6; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>PreQual Pro — Invitation</h1>
            </div>
            <div class="body">
              <p>Hello,</p>
              <p><strong>${senderName}</strong> has invited you to join their team as a <strong>${recipientRoleLabel}</strong>${projectLine}.</p>
              <p>Please click the button below to accept your invitation:</p>
              <a href="${inviteLink}" class="btn">Accept Invitation →</a>
              <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">Or copy this link: ${inviteLink}</p>
            </div>
            <div class="footer">
              <p>You received this email because ${senderName} invited you to PreQual Pro. If you believe this was sent in error, please ignore it.</p>
              <p>This invitation expires in 7 days.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    res.json({ success: true, message: 'Invitation email sent', invitation })
  } catch (err: unknown) {
    console.error('[invitations] Email send error:', err)
    console.log(`[invitations] Invite link (email failed): ${inviteLink}`)
    res.json({ success: true, message: 'Invitation created (email delivery failed)', invitation })
  }
})

/**
 * POST /api/invitations/resend
 * Refreshes an existing invitation's token + expiry and resends the email.
 * Requires auth.
 */
router.post('/resend', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ invitation_id: z.string().uuid() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invitation_id is required' })
    return
  }

  const { invitation_id } = parsed.data
  const senderId = req.userId!

  // Verify the invitation belongs to this sender
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('id', invitation_id)
    .eq('sender_id', senderId)
    .single()

  if (fetchErr || !existing) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }

  // Refresh token and expiry
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await supabaseAdmin
    .from('invitations')
    .update({ token, expires_at: expiresAt, status: 'pending' })
    .eq('id', invitation_id)

  if (updateErr) {
    res.status(500).json({ error: 'Failed to refresh invitation' })
    return
  }

  // Fetch sender profile + company name
  const { data: sender } = await supabaseAdmin
    .from('profiles')
    .select('full_name, company_name, email, company:companies!new_company_id(name)')
    .eq('id', senderId)
    .single()

  let projectName: string | undefined
  if (existing.project_id) {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', existing.project_id)
      .single()
    projectName = project?.name
  }

  const senderName = (sender as any)?.company?.name || (sender as any)?.company_name || (sender as any)?.full_name || 'A construction company'
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const inviteLink = `${clientUrl}/invite/${token}`
  const recipientRoleLabel =
    existing.recipient_role === 'gc' ? 'General Contractor' :
    existing.recipient_role === 'trade' ? 'Trade Subcontractor' :
    'Team Member'

  const transporter = createTransporter()
  if (!transporter) {
    console.log(`[invitations] SMTP not configured. Resend link: ${inviteLink}`)
    res.json({ success: true, message: 'Invitation refreshed (email not sent — SMTP not configured)' })
    return
  }

  try {
    await transporter.sendMail({
      from: `"PreQual Pro" <${process.env.FROM_EMAIL || 'noreply@prequalpro.com'}>`,
      to: existing.recipient_email,
      subject: `You've been invited to join ${senderName} on PreQual Pro`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #111827; background: #f9fafb; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
            .header { background: #1e40af; color: white; padding: 24px 32px; }
            .header h1 { margin: 0; font-size: 20px; }
            .body { padding: 32px; }
            .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 16px; }
            .footer { padding: 16px 32px; background: #f3f4f6; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>PreQual Pro — Invitation</h1>
            </div>
            <div class="body">
              <p>Hello,</p>
              <p><strong>${senderName}</strong> has invited you to join their team as a <strong>${recipientRoleLabel}</strong>${projectName ? ` for the project <strong>${projectName}</strong>` : ''}.</p>
              <p>Please click the button below to accept your invitation:</p>
              <a href="${inviteLink}" class="btn">Accept Invitation →</a>
              <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">Or copy this link: ${inviteLink}</p>
            </div>
            <div class="footer">
              <p>You received this email because ${senderName} invited you to PreQual Pro. If you believe this was sent in error, please ignore it.</p>
              <p>This invitation expires in 7 days.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })
    res.json({ success: true, message: 'Invitation email resent' })
  } catch (err: unknown) {
    console.error('[invitations] Resend email error:', err)
    console.log(`[invitations] Resend link (email failed): ${inviteLink}`)
    res.json({ success: true, message: 'Invitation refreshed (email delivery failed)' })
  }
})

/**
 * GET /api/invitations/token/:token
 * Public — look up an invitation by token.
 */
router.get('/token/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params

  const { data: invitation, error } = await supabaseAdmin
    .from('invitations')
    .select('*, sender:profiles!sender_id(id, full_name, company_name, company:companies!new_company_id(name)), invitation_projects(project:projects(id, name))')
    .eq('token', token)
    .single()

  if (error || !invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    res.status(404).json({ error: 'Invitation has expired' })
    return
  }

  if (invitation.status === 'accepted') {
    res.status(404).json({ error: 'Invitation has already been accepted' })
    return
  }

  const sender = invitation.sender as { id?: string; full_name?: string; company_name?: string; company?: { name?: string } } | null
  const projects = ((invitation.invitation_projects ?? []) as any[])
    .map((ip) => ip.project)
    .filter(Boolean) as { id: string; name: string }[]

  res.json({
    recipient_email: invitation.recipient_email,
    recipient_role: invitation.recipient_role,
    recipient_company_name: invitation.recipient_company_name,
    project_id: invitation.project_id,
    projects,
    sender_id: sender?.id,
    sender_name: sender?.company?.name || sender?.company_name || sender?.full_name,
  })
})

/**
 * POST /api/invitations/accept
 * Requires auth. Accepts { token }, verifies email match, marks accepted,
 * inserts project_member and/or sets company_id for gc_member invites.
 */
router.post('/accept', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ token: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'token is required' })
    return
  }

  const { token } = parsed.data

  const { data: invitation, error } = await supabaseAdmin
    .from('invitations')
    .select('*, sender:profiles!sender_id(id, company_id, new_company_id)')
    .eq('token', token)
    .single()

  if (error || !invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    res.status(400).json({ error: 'Invitation has expired' })
    return
  }

  // QR invites have a placeholder email — skip email check for those
  const isQrInvite = (invitation.recipient_email as string).endsWith('@placeholder.invalid')
  if (!isQrInvite && invitation.recipient_email !== req.userEmail) {
    res.status(403).json({ error: 'This invitation is not for your email address' })
    return
  }

  // Mark accepted
  const { error: updateErr } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id)

  if (updateErr) {
    res.status(500).json({ error: 'Failed to accept invitation' })
    return
  }

  // For team member invites: set company on the acceptor's profile
  const memberRoleMap: Record<string, string> = {
    gc_member: 'gc',
    owner_member: 'owner',
    trade_member: 'trade',
  }
  if (memberRoleMap[invitation.recipient_role]) {
    const sender = invitation.sender as { id?: string; company_id?: string; new_company_id?: string } | null
    const companyType = memberRoleMap[invitation.recipient_role]
    // Legacy self-ref company_id fallback: sender.company_id || sender.id
    const legacyCompanyId = sender?.company_id || sender?.id
    const newCompanyId = sender?.new_company_id

    if (legacyCompanyId || newCompanyId) {
      await supabaseAdmin
        .from('profiles')
        .update({
          // Legacy columns — keep populated during transition
          company_id: legacyCompanyId,
          role: companyType,
          member_role: 'contributor',
          // New columns
          new_company_id: newCompanyId ?? null,
          company_type: companyType,
          user_role: 'contributor',
        })
        .eq('id', req.userId!)
    }
  }

  // Connect to every project attached to the invite (zero, one, or many).
  // Falls back to the legacy single project_id for invites sent before
  // multi-project support existed.
  const { data: linkedProjects } = await supabaseAdmin
    .from('invitation_projects')
    .select('project_id')
    .eq('invitation_id', invitation.id)

  const projectIds = linkedProjects?.length
    ? linkedProjects.map((p) => p.project_id)
    : invitation.project_id
      ? [invitation.project_id]
      : []

  if (projectIds.length) {
    const memberRole = memberRoleMap[invitation.recipient_role] ?? invitation.recipient_role
    const { data: existingMemberships } = await supabaseAdmin
      .from('project_members')
      .select('project_id')
      .eq('user_id', req.userId!)
      .in('project_id', projectIds)
    const alreadyMember = new Set((existingMemberships ?? []).map((m) => m.project_id))
    const toInsert = projectIds
      .filter((id) => !alreadyMember.has(id))
      .map((project_id) => ({ project_id, user_id: req.userId, role: memberRole }))

    if (toInsert.length) {
      await supabaseAdmin.from('project_members').insert(toInsert)
    }
  }

  res.json({ success: true, project_ids: projectIds })
})

export default router
