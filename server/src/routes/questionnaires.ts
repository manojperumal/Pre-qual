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

Review these documents and call the submit_answers tool with your findings for each question below.

Rules:
- For radio_yes_no: answer_text must be exactly "yes" or "no". Also populate company_comments with a brief explanation of what the document shows (e.g. policy number, coverage limits, expiry date, EMR value, etc.)
- For number: answer_text must be a numeric string (e.g. "1.2" or "5"). Populate company_comments with where in the document the value was found.
- For multi_select: answer_options must only contain values from the provided options list. Populate company_comments with supporting details from the document.
- For document_upload: set answer_text to null. Populate company_comments noting whether the relevant document was provided and any key details visible.
- For text_area: provide a concise extracted answer in answer_text.
- If you cannot determine an answer, set answer_text/answer_options to null and use company_comments to explain what additional document or information is needed.
- Be conservative — only answer "yes" when you have clear evidence.

Questions:
${questionsText}`,
  })

  // Call Claude using tool use to force structured output
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const submitAnswersTool: Anthropic.Tool = {
    name: 'submit_answers',
    description: 'Submit pre-qualification answers for all questions based on the uploaded documents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question_id: { type: 'string', description: 'The exact UUID of the question' },
              answer_text: { type: ['string', 'null'], description: 'Answer for radio_yes_no ("yes"/"no"), text_area, or number questions' },
              answer_options: { type: ['array', 'null'], items: { type: 'string' }, description: 'Selected options for multi_select questions' },
              company_comments: { type: 'string', description: 'Supporting details from the document — policy numbers, values found, coverage details, or what is missing' },
              mojo_feedback: { type: 'string', description: 'Internal Mojo note: confidence level and source reference in the document' },
            },
            required: ['question_id', 'company_comments', 'mojo_feedback'],
          },
        },
      },
      required: ['answers'],
    },
  }

  let answers: any[]
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      tools: [submitAnswersTool],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: contentBlocks }],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use') as any
    if (!toolUse) throw new Error('Claude did not call the tool')
    answers = (toolUse.input as any).answers ?? []
  } catch (err: any) {
    console.error('[ai-complete] Claude API error:', err)
    res.status(500).json({ error: 'AI processing failed: ' + (err.message ?? 'Unknown error') })
    return
  }

  // Upsert each AI-suggested response into DB
  let savedCount = 0
  for (const answer of answers) {
    if (!answer.question_id) continue
    const { error: upsertErr } = await supabaseAdmin
      .from('questionnaire_responses')
      .upsert(
        {
          assignment_id: assignmentId,
          question_id: answer.question_id,
          answer_text: answer.answer_text ?? null,
          answer_options: answer.answer_options ?? null,
          company_comments: answer.company_comments ?? null,
          mojo_feedback: answer.mojo_feedback ?? null,
          ai_suggested: true,
        },
        { onConflict: 'assignment_id,question_id' }
      )
    if (upsertErr) {
      console.error('[ai-complete] Upsert error for question', answer.question_id, ':', upsertErr.message)
    } else {
      savedCount++
    }
  }
  console.log(`[ai-complete] Saved ${savedCount}/${answers.length} answers for assignment ${assignmentId}`)

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
