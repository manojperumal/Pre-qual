import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected']),
})

/**
 * PATCH /api/prequalifications/:id/status
 * Updates the status of a prequalification.
 * - Applicant can move draft → submitted
 * - Requester can move submitted → under_review / approved / rejected
 */
router.patch('/:id/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const parsed = statusUpdateSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status value' })
    return
  }

  const { status: newStatus } = parsed.data

  // Fetch the prequalification
  const { data: prequal, error: fetchErr } = await supabaseAdmin
    .from('prequalifications')
    .select('id, status, applicant_id, requester_id')
    .eq('id', id)
    .single()

  if (fetchErr || !prequal) {
    res.status(404).json({ error: 'Prequalification not found' })
    return
  }

  // Check transition is valid
  const allowedNext = VALID_TRANSITIONS[prequal.status as string] ?? []
  if (!allowedNext.includes(newStatus)) {
    res.status(422).json({
      error: `Cannot transition from "${prequal.status}" to "${newStatus}"`,
    })
    return
  }

  // Check authorization
  const isApplicant = prequal.applicant_id === req.userId
  const isRequester = prequal.requester_id === req.userId

  if (newStatus === 'submitted' && !isApplicant) {
    res.status(403).json({ error: 'Only the applicant can submit a pre-qualification' })
    return
  }

  if (['under_review', 'approved', 'rejected'].includes(newStatus) && !isRequester) {
    res.status(403).json({ error: 'Only the requester can change review status' })
    return
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('prequalifications')
    .update({ status: newStatus })
    .eq('id', id)
    .select()
    .single()

  if (updateErr) {
    res.status(500).json({ error: 'Failed to update status' })
    return
  }

  res.json({ success: true, prequalification: updated })
})

/**
 * GET /api/prequalifications/:id
 * Returns a prequalification with related profiles.
 * Requires the requester to be either the applicant or requester.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  const { data, error } = await supabaseAdmin
    .from('prequalifications')
    .select('*, applicant:profiles!applicant_id(*), requester:profiles!requester_id(*)')
    .eq('id', id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  // Verify access
  if (data.applicant_id !== req.userId && data.requester_id !== req.userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  res.json(data)
})

export default router
