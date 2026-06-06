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
    return null
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const sendSchema = z.object({
  recipient_email: z.string().email(),
  recipient_role: z.enum(['gc', 'trade', 'gc_member']),
  project_id: z.string().uuid().optional(),
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

  const { recipient_email, recipient_role, project_id } = parsed.data
  const senderId = req.userId!

  // Generate a secure token
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch sender profile
  const { data: sender } = await supabaseAdmin
    .from('profiles')
    .select('full_name, company_name, email')
    .eq('id', senderId)
    .single()

  // Fetch project name if project_id provided
  let projectName: string | undefined
  if (project_id) {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', project_id)
      .single()
    projectName = project?.name
  }

  // Insert invitation record (store gc_member as-is in recipient_role)
  const { data: invitation, error: insertErr } = await supabaseAdmin
    .from('invitations')
    .insert({
      sender_id: senderId,
      recipient_email,
      recipient_role,
      project_id: project_id ?? null,
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

  const senderName = (sender as any)?.company_name || (sender as any)?.full_name || 'A construction company'
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const inviteLink = `${clientUrl}/invite/${token}`
  const recipientRoleLabel =
    recipient_role === 'gc' ? 'General Contractor' :
    recipient_role === 'gc_member' ? 'Team Member' :
    'Trade Subcontractor'

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

    res.json({ success: true, message: 'Invitation email sent', invitation })
  } catch (err: unknown) {
    console.error('[invitations] Email send error:', err)
    console.log(`[invitations] Invite link (email failed): ${inviteLink}`)
    res.json({ success: true, message: 'Invitation created (email delivery failed)', invitation })
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
    .select('*, sender:profiles!sender_id(id, full_name, company_name), project:projects(name)')
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

  const sender = invitation.sender as { id?: string; full_name?: string; company_name?: string } | null
  const project = invitation.project as { name?: string } | null

  res.json({
    recipient_email: invitation.recipient_email,
    recipient_role: invitation.recipient_role,
    project_id: invitation.project_id,
    project_name: project?.name,
    sender_id: sender?.id,
    sender_name: sender?.company_name || sender?.full_name,
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
    .select('*, sender:profiles!sender_id(id, company_id)')
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

  // For gc_member invites: set company_id on the acceptor's profile
  if (invitation.recipient_role === 'gc_member') {
    const sender = invitation.sender as { id?: string; company_id?: string } | null
    // company_id is either the sender's company_id (if they're also a member) or the sender's own id
    const companyId = sender?.company_id || sender?.id
    if (companyId) {
      await supabaseAdmin
        .from('profiles')
        .update({ company_id: companyId, role: 'gc' })
        .eq('id', req.userId!)
    }
  }

  // Insert project_member if project_id is set
  if (invitation.project_id) {
    const memberRole = invitation.recipient_role === 'gc_member' ? 'gc' : invitation.recipient_role
    await supabaseAdmin
      .from('project_members')
      .insert({
        project_id: invitation.project_id,
        user_id: req.userId,
        role: memberRole,
      })
      .select()
      .single()
  }

  res.json({ success: true, project_id: invitation.project_id ?? null })
})

export default router
