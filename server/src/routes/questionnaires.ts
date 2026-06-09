import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  safety_manual: 'Safety Manual',
  osha_log: 'OSHA Log',
  coi: 'Certificate of Insurance (COI)',
  loss_runs: 'Loss Runs',
  other: 'Supporting Document',
}

/**
 * POST /api/questionnaires/:assignmentId/ai-complete
 * Reads uploaded contractor documents and auto-fills questionnaire answers using Claude.
 * Body: { document_paths: Array<{ path: string; type: string; name: string }> }
 */
router.post('/:assignmentId/ai-complete', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params
  const { document_paths = [] } = req.body as {
    document_paths: Array<{ path: string; type: string; name: string }>
  }

  if (!document_paths.length) {
    res.status(400).json({ error: 'No documents provided. Please upload at least one document.' })
    return
  }

  // Fetch assignment + verify access
  const { data: assignment, error: assignmentErr } = await supabaseAdmin
    .from('questionnaire_assignments')
    .select('*, questionnaire:questionnaires(id, name), project:projects(id, name)')
    .eq('id', assignmentId)
    .single()

  if (assignmentErr || !assignment) {
    res.status(404).json({ error: 'Assignment not found' })
    return
  }

  if (assignment.assignee_id !== req.userId && assignment.assigned_by !== req.userId) {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  // Fetch questionnaire questions
  const { data: qqList, error: questionsErr } = await supabaseAdmin
    .from('questionnaire_questions')
    .select('*, question:question_bank(*)')
    .eq('questionnaire_id', assignment.questionnaire_id)
    .order('order_index')

  if (questionsErr || !qqList?.length) {
    res.status(400).json({ error: 'No questions found for this questionnaire' })
    return
  }

  // Download documents from Supabase Storage and convert to base64
  const documentContents: Array<{ name: string; type: string; base64: string; mimeType: string }> = []

  for (const doc of document_paths) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from('questionnaire-docs')
        .download(doc.path)

      if (error || !data) {
        console.warn(`[ai-complete] Could not download ${doc.path}:`, error?.message)
        continue
      }

      const arrayBuffer = await data.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const nameLower = doc.name.toLowerCase()
      const mimeType = nameLower.endsWith('.pdf')
        ? 'application/pdf'
        : nameLower.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : nameLower.endsWith('.doc')
        ? 'application/msword'
        : 'image/jpeg'
      documentContents.push({ name: doc.name, type: doc.type, base64, mimeType })
    } catch (err) {
      console.warn(`[ai-complete] Error processing document ${doc.name}:`, err)
    }
  }

  if (!documentContents.length) {
    res.status(400).json({ error: 'Could not read any of the uploaded documents.' })
    return
  }

  // Build the questions list for the prompt
  const questionsText = qqList
    .map((qq, i) => {
      const q = qq.question as any
      if (!q) return null
      let meta = `Q${i + 1} [ID: ${q.id}] [Type: ${q.answer_type}]`
      if (q.answer_type === 'multi_select' && q.options) {
        meta += ` [Options: ${(q.options as string[]).join(' | ')}]`
      }
      if (q.hint) meta += ` [Hint: ${q.hint}]`
      return `${meta}\n${q.question_text}`
    })
    .filter(Boolean)
    .join('\n\n')

  // Build document descriptions for the prompt
  const docDescriptions = documentContents
    .map((d) => `- ${DOCUMENT_TYPE_LABELS[d.type] ?? d.type}: ${d.name}`)
    .join('\n')

  // Build message content — include documents as base64
  const contentBlocks: Anthropic.MessageParam['content'] = []

  // Add each document
  for (const doc of documentContents) {
    contentBlocks.push({
      type: 'text',
      text: `Document: ${DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} — "${doc.name}"`,
    })
    if (doc.mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
      } as any)
    } else if (
      doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      doc.mimeType === 'application/msword'
    ) {
      // Extract text from Word doc and send as plain text block
      try {
        const buffer = Buffer.from(doc.base64, 'base64')
        const result = await mammoth.extractRawText({ buffer })
        contentBlocks.push({
          type: 'text',
          text: `[Word Document Content — ${doc.name}]\n${result.value}`,
        })
      } catch (err) {
        console.warn(`[ai-complete] Could not extract text from Word doc ${doc.name}:`, err)
        contentBlocks.push({
          type: 'text',
          text: `[Word Document — ${doc.name}: could not extract text]`,
        })
      }
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: doc.mimeType as 'image/jpeg',
          data: doc.base64,
        },
      })
    }
  }

  // Add the instruction prompt
  contentBlocks.push({
    type: 'text',
    text: `You are a pre-qualification specialist reviewing contractor documents for a construction project.

The contractor has uploaded the following documents:
${docDescriptions}

Your task is to review these documents and answer each question in the pre-qualification questionnaire. For each question, provide:
1. The best answer based on document content
2. A brief "mojo_feedback" comment explaining what you found (or didn't find) in the documents

**Questionnaire Questions:**
${questionsText}

**Response Format:**
Return a JSON object with a "answers" key containing an array of objects, one per question. Each object must have:
- "question_id": the exact UUID from [ID: ...] above
- "answer_text": for radio_yes_no (must be "yes" or "no"), text_area, or number questions
- "answer_options": for multi_select questions (array of option strings from the provided options)
- "mojo_feedback": a 1-2 sentence explanation of what was found in documents or why manual input is needed
- "ai_suggested": always true

Rules:
- For radio_yes_no: answer_text must be exactly "yes" or "no"
- For number: answer_text must be a numeric string (e.g. "1.2" or "5")
- For multi_select: answer_options must only contain values from the provided options list
- For document_upload questions: set answer_text to null; in mojo_feedback note if the document type was provided
- For text_area: provide a concise extracted answer
- If you cannot determine an answer from the documents, set answer_text/answer_options to null and in mojo_feedback explain what additional document is needed
- Be precise and conservative — only answer "yes" when you have clear evidence

Return ONLY valid JSON, no markdown, no explanation outside the JSON.`,
  })

  // Call Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let aiResponse: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: contentBlocks }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    aiResponse = (textBlock as any)?.text ?? ''
  } catch (err: any) {
    console.error('[ai-complete] Claude API error:', err)
    res.status(500).json({ error: 'AI processing failed: ' + (err.message ?? 'Unknown error') })
    return
  }

  // Parse response — try multiple strategies to extract JSON
  let answers: any[]
  try {
    // Strategy 1: strip markdown fences and parse directly
    let cleaned = aiResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

    // Strategy 2: extract first JSON object found in the string
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) cleaned = match[0]
    }

    const parsed = JSON.parse(cleaned)
    // Handle both { answers: [...] } and a bare array
    answers = Array.isArray(parsed) ? parsed : (parsed.answers ?? [])

    if (!Array.isArray(answers)) throw new Error('answers is not an array')
  } catch (err) {
    console.error('[ai-complete] Failed to parse Claude response. Raw response:', aiResponse.slice(0, 500))
    res.status(500).json({ error: 'AI returned an unexpected format. Please try again.' })
    return
  }

  // Upsert each AI-suggested response into DB
  for (const answer of answers) {
    if (!answer.question_id) continue
    await supabaseAdmin
      .from('questionnaire_responses')
      .upsert(
        {
          assignment_id: assignmentId,
          question_id: answer.question_id,
          answer_text: answer.answer_text ?? null,
          answer_options: answer.answer_options ?? null,
          mojo_feedback: answer.mojo_feedback ?? null,
          ai_suggested: true,
        },
        { onConflict: 'assignment_id,question_id' }
      )
  }

  // Update assignment status to in_progress if still pending
  if (assignment.status === 'pending') {
    await supabaseAdmin
      .from('questionnaire_assignments')
      .update({ status: 'in_progress' })
      .eq('id', assignmentId)
  }

  res.json({ success: true, answers_count: answers.length })
})

export default router
