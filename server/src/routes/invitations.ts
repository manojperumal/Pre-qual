import { Router, Request, Response } from 'express'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

// Create nodemailer transporter
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const sendSchema = z.object({
  invitationId: z.string().uuid(),
})

/**
 * POST /api/invitations/send
 * Sends invitation email for an already-created invitation record.
 * Requires auth so we can verify the sender owns the invitation.
 */
router.post('/send', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invitationId is required (UUID)' })
    return
  }

  const { invitationId } = parsed.data

  // Fetch invitation + sender profile
  const { data: invitation, error: invErr } = await supabaseAdmin
    .from('invitations')
    .select('*, sender:profiles!sender_id(full_name, company_name, email)')
    .eq('id', invitationId)
    .single()

  if (invErr || !invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }

  // Security check: only the sender can trigger sending
  if (invitation.sender_id !== req.userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const sender = invitation.sender as {
    full_name?: string
    company_name?: string
    email?: string
  } | null

  const senderName = sender?.company_name || sender?.full_name || 'A construction company'
  const recipientRole = invitation.recipient_role === 'gc' ? 'General Contractor' : 'Trade Subcontractor'
  const appUrl = process.env.APP_URL || 'http://localhost:5173'

  try {
    const transporter = createTransporter()

    await transporter.sendMail({
      from: `"PreQual Pro" <${process.env.FROM_EMAIL || 'noreply@prequalpro.com'}>`,
      to: invitation.recipient_email,
      subject: `Pre-Qualification Invitation from ${senderName}`,
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
              <h1>🏗 PreQual Pro — Pre-Qualification Invitation</h1>
            </div>
            <div class="body">
              <p>Hello,</p>
              <p><strong>${senderName}</strong> has invited you to complete a pre-qualification as a <strong>${recipientRole}</strong>.</p>
              <p>Pre-qualification helps construction owners and general contractors evaluate vendors before awarding contracts. Please complete your application at your earliest convenience.</p>
              <a href="${appUrl}/signup" class="btn">Complete Pre-Qualification →</a>
              <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
                If you already have an account, <a href="${appUrl}/login" style="color: #2563eb;">sign in here</a>.
              </p>
            </div>
            <div class="footer">
              <p>You received this email because ${senderName} invited you to PreQual Pro. If you believe this was sent in error, please ignore it.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    // Mark invitation as still pending (email sent)
    res.json({ success: true, message: 'Invitation email sent' })
  } catch (err: unknown) {
    console.error('[invitations] Email send error:', err)
    res.status(500).json({ error: 'Failed to send email. Invitation was already created in DB.' })
  }
})

/**
 * POST /api/invitations/accept
 * Mark an invitation as accepted when the recipient signs up.
 */
router.post('/accept', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ invitationId: z.string().uuid() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invitationId is required' })
    return
  }

  const { invitationId } = parsed.data

  // Verify this invitation belongs to the current user's email
  const { data: invitation, error } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('id', invitationId)
    .single()

  if (error || !invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }

  if (invitation.recipient_email !== req.userEmail) {
    res.status(403).json({ error: 'This invitation is not for your email address' })
    return
  }

  const { error: updateErr } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitationId)

  if (updateErr) {
    res.status(500).json({ error: 'Failed to accept invitation' })
    return
  }

  res.json({ success: true })
})

export default router
