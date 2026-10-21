import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  safety_manual: 'Safety Manual',
  osha_log: 'OSHA Log',
  osha_300: 'OSHA 300 Log',
  osha_301: 'OSHA 301 Log',
  osha_citations: 'OSHA Citations',
  coi: 'Certificate of Insurance (COI)',
  w9: 'W-9',
  license: 'License',
  loss_runs: 'Loss Runs',
  ptp_photos: 'PTP Photos',
  ptp_plan: 'PTP Program Plan',
  bond: 'Bonding Document',
  sop: 'Standard Operating Procedure',
  other: 'Supporting Document',
}

interface GatheredDoc {
  path: string
  bucket: string
  type: string
  name: string
  source: string
}

// A hard cap on how many documents we'll ever send to the model in one
// call — company libraries and submission history can accumulate a lot of
// files over time, and an unbounded set risks blowing the context window
// and the per-request cost. Newest-first ordering (each source query below
// orders by created_at desc) means anything dropped is the oldest/least
// relevant.
const MAX_AUTO_DOCUMENTS = 25

// A file's extension is just a hint from whoever named it — someone can
// rename a HEIC screenshot to ".jpg" or hand us a mislabeled export.
// Claude rejects the whole request if an "image" block's bytes don't
// actually decode as that image type, so we verify the real file
// signature before trusting the extension, and skip (rather than send)
// anything that doesn't match.
function matchesImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false
  switch (mimeType) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    case 'image/png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    case 'image/gif':
      return buffer.toString('ascii', 0, 3) === 'GIF'
    case 'image/webp':
      return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
    default:
      return false
  }
}

/**
 * Automatically collects every document already on file for a company that
 * could plausibly answer a questionnaire — its shared document library
 * (Safety Manual, COI, W-9, Loss Runs, License) plus whatever it has
 * uploaded to any of its own project pre-qualification submissions (COI,
 * OSHA logs, Loss Runs, PTP photos) — so a contractor doesn't have to
 * re-upload things it has already given us elsewhere. Manually-added
 * per-questionnaire uploads (see the route handler) are merged in on top
 * of this, and existing document_upload answers within the SAME
 * questionnaire are still pulled in by the caller as before.
 */
async function gatherCompanyDocuments(companyId: string): Promise<{ docs: GatheredDoc[]; truncated: boolean }> {
  const docs: GatheredDoc[] = []

  const { data: companyDocs } = await supabaseAdmin
    .from('company_documents')
    .select('storage_path, document_type, document_name, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  for (const d of companyDocs ?? []) {
    docs.push({ path: d.storage_path, bucket: 'prequal-documents', type: d.document_type, name: d.document_name, source: 'Company document library' })
  }

  // Ask Mojo reference documents — files uploaded to ground an in-progress
  // drafting thread. These aren't in company_documents until the thread is
  // published, but they're already real source material the contractor
  // gave us, so AI-complete should be able to read them too.
  const { data: threadIds } = await supabaseAdmin
    .from('ask_mojo_threads')
    .select('id')
    .eq('company_id', companyId)

  const askMojoThreadIds = (threadIds ?? []).map((t) => t.id)
  if (askMojoThreadIds.length) {
    const { data: referenceDocs } = await supabaseAdmin
      .from('ask_mojo_reference_documents')
      .select('storage_path, file_name, created_at')
      .in('thread_id', askMojoThreadIds)
      .order('created_at', { ascending: false })

    for (const d of referenceDocs ?? []) {
      docs.push({ path: d.storage_path, bucket: 'prequal-documents', type: 'other', name: d.file_name, source: 'Ask Mojo reference document' })
    }
  }

  // Every profile at this company, so we can pull in documents any of
  // them uploaded to a project submission (not just the one respondent).
  const { data: companyProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('new_company_id', companyId)
  const profileIds = (companyProfiles ?? []).map((p) => p.id)

  if (profileIds.length) {
    const { data: submissions } = await supabaseAdmin
      .from('project_submissions')
      .select('id')
      .in('contractor_id', profileIds)

    const submissionIds = (submissions ?? []).map((s) => s.id)
    if (submissionIds.length) {
      const { data: subDocs } = await supabaseAdmin
        .from('submission_documents')
        .select('storage_path, doc_type, file_name, created_at')
        .in('submission_id', submissionIds)
        .order('created_at', { ascending: false })

      for (const d of subDocs ?? []) {
        docs.push({ path: d.storage_path, bucket: 'prequal-documents', type: d.doc_type, name: d.file_name, source: 'Project pre-qualification submission' })
      }
    }
  }

  const truncated = docs.length > MAX_AUTO_DOCUMENTS
  return { docs: docs.slice(0, MAX_AUTO_DOCUMENTS), truncated }
}

/**
 * GET /api/questionnaires/:assignmentId/available-documents
 * Lets the client show the contractor what's already on file (without
 * downloading/processing anything) before they click "Complete with AI" —
 * so they know whether they need to upload anything extra.
 */
router.get('/:assignmentId/available-documents', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params

  const { data: assignment, error: assignmentErr } = await supabaseAdmin
    .from('questionnaire_assignments')
    .select('assignee_id, assigned_by, company_id')
    .eq('id', assignmentId)
    .single()

  if (assignmentErr || !assignment) {
    res.status(404).json({ error: 'Assignment not found' })
    return
  }
  if (!(await hasAssignmentAccess(assignment, req.userId!))) {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  const companyId = await resolveCompanyId(assignment)
  if (!companyId) {
    res.json({ documents: [], truncated: false })
    return
  }

  const { docs, truncated } = await gatherCompanyDocuments(companyId)
  res.json({
    documents: docs.map((d) => ({ path: d.path, name: d.name, type: d.type, source: d.source })),
    truncated,
  })
})

async function resolveCompanyId(assignment: { company_id?: string | null; assignee_id?: string | null }): Promise<string | null> {
  if (assignment.company_id) return assignment.company_id
  if (!assignment.assignee_id) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('new_company_id')
    .eq('id', assignment.assignee_id)
    .single()
  return profile?.new_company_id ?? null
}

// Assignments target a company (026) — assignee_id only gets stamped once
// someone actually works on it, so checking just assignee_id/assigned_by
// locks out every other admin/contributor at that company from an
// assignment nobody has touched yet. Any member of the assigned company
// (or the one who created it) should have access.
async function hasAssignmentAccess(
  assignment: { company_id?: string | null; assignee_id?: string | null; assigned_by?: string | null },
  userId: string
): Promise<boolean> {
  if (assignment.assignee_id === userId || assignment.assigned_by === userId) return true
  if (!assignment.company_id) return false
  const { data: profile } = await supabaseAdmin.from('profiles').select('new_company_id').eq('id', userId).single()
  return profile?.new_company_id === assignment.company_id
}

/**
 * POST /api/questionnaires/:assignmentId/review-summary
 * Generates an on-demand AI summary of a submitted questionnaire's answers
 * for a reviewer (Owner/GC): which questions deserve a closer look, plus
 * an overall bullet-point summary. Not persisted — regenerated each time
 * a reviewer asks for it.
 */
router.post('/:assignmentId/review-summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params

  const { data: assignment, error: assignmentErr } = await supabaseAdmin
    .from('questionnaire_assignments')
    .select('assignee_id, assigned_by, company_id, status, questionnaire:questionnaires(name)')
    .eq('id', assignmentId)
    .single()

  if (assignmentErr || !assignment) {
    res.status(404).json({ error: 'Assignment not found' })
    return
  }
  if (!(await hasAssignmentAccess(assignment, req.userId!))) {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  const { data: fullAssignment } = await supabaseAdmin
    .from('questionnaire_assignments')
    .select('questionnaire_id')
    .eq('id', assignmentId)
    .single()

  const { data: qqListFinal, error: qqErr } = await supabaseAdmin
    .from('questionnaire_questions')
    .select('*, question:question_bank!questionnaire_questions_question_id_fkey(*)')
    .eq('questionnaire_id', fullAssignment?.questionnaire_id)
    .order('order_index')

  if (qqErr || !qqListFinal?.length) {
    res.status(400).json({ error: 'No questions found for this questionnaire' })
    return
  }

  const { data: responses } = await supabaseAdmin
    .from('questionnaire_responses')
    .select('*')
    .eq('assignment_id', assignmentId)

  const responseMap = new Map((responses ?? []).map((r) => [r.question_id, r]))

  const qaText = qqListFinal
    .map((qq: any, i: number) => {
      const q = qq.question
      if (!q) return null
      const r = responseMap.get(q.id)
      let answer = '(no answer provided)'
      if (r) {
        if (r.answer_text) answer = r.answer_text
        else if (r.answer_options?.length) answer = r.answer_options.join(', ')
        else if (r.document_path) answer = `Document uploaded: ${r.document_name ?? r.document_path}`
        if (r.company_comments) answer += `\nComments: ${r.company_comments}`
      }
      return `Q${i + 1}: ${q.question_text}\nA${i + 1}: ${answer}`
    })
    .filter(Boolean)
    .join('\n\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const submitSummaryTool: Anthropic.Tool = {
    name: 'submit_review_summary',
    description: 'Submit a structured review summary of a submitted pre-qualification questionnaire.',
    input_schema: {
      type: 'object' as const,
      properties: {
        attention: {
          type: 'array',
          items: { type: 'string' },
          description: 'Bullet points calling out specific questions/answers the reviewer should pay closer attention to (risk flags, missing info, inconsistent or concerning answers). Each bullet should name the specific question or topic. Empty array if nothing stands out.',
        },
        summary: {
          type: 'array',
          items: { type: 'string' },
          description: 'Bullet points giving an overall summary of how this contractor answered the questionnaire as a whole.',
        },
      },
      required: ['attention', 'summary'],
    },
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      tools: [submitSummaryTool],
      tool_choice: { type: 'tool', name: 'submit_review_summary' },
      messages: [
        {
          role: 'user',
          content: `You are a pre-qualification specialist helping a reviewer (Owner or General Contractor) quickly assess a contractor's completed pre-qualification questionnaire "${(assignment as any).questionnaire?.name ?? ''}" before approving it.

Below are the questions and the contractor's submitted answers. Produce:
1. "attention" — bullet points flagging specific questions/answers the reviewer should look at more closely: missing answers, "no" answers to safety/compliance questions, low/concerning values (e.g. high EMR, no PTP program), missing documents, or anything inconsistent. If everything looks fine, return an empty array.
2. "summary" — a concise bullet-point overview of the contractor's answers as a whole (their safety posture, insurance standing, experience, etc.)

Keep each bullet short (one sentence). Base everything strictly on the answers given — do not speculate beyond what's stated.

Questionnaire responses:
${qaText}`,
        },
      ],
    })

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) {
      res.status(502).json({ error: 'AI did not return a summary' })
      return
    }
    const input = toolUse.input as { attention?: string[]; summary?: string[] }
    res.json({ attention: input.attention ?? [], summary: input.summary ?? [] })
  } catch (err: any) {
    console.error('[review-summary] Anthropic call failed:', err)
    res.status(500).json({ error: err?.message ?? 'AI summary failed' })
  }
})

/**
 * POST /api/questionnaires/:assignmentId/ai-complete
 * Reads uploaded contractor documents and auto-fills questionnaire answers using Claude.
 * Body: { document_paths: Array<{ path: string; type: string; name: string }> }
 */
router.post('/:assignmentId/ai-complete', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params
  const { document_paths = [], excluded_document_paths = [] } = req.body as {
    document_paths: Array<{ path: string; type: string; name: string }>
    excluded_document_paths?: string[]
  }
  const excludedPaths = new Set(excluded_document_paths)

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

  if (!(await hasAssignmentAccess(assignment, req.userId!))) {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  // Fetch questionnaire questions
  const { data: qqList, error: questionsErr } = await supabaseAdmin
    .from('questionnaire_questions')
    .select('*, question:question_bank!questionnaire_questions_question_id_fkey(*)')
    .eq('questionnaire_id', assignment.questionnaire_id)
    .order('order_index')

  if (questionsErr || !qqList?.length) {
    console.error('[ai-complete] questionnaire_questions query failed or empty:', {
      questionnaireId: assignment.questionnaire_id,
      questionsErr,
      rowCount: qqList?.length ?? 0,
    })
    res.status(400).json({ error: 'No questions found for this questionnaire' })
    return
  }

  // Also pull in documents already uploaded as answers to document_upload
  // questions elsewhere in this questionnaire — e.g. a COI uploaded to
  // answer "Upload your Certificate of Insurance" is fair game for
  // answering other questions ("What is your policy expiry date?") too.
  const { data: existingDocResponses } = await supabaseAdmin
    .from('questionnaire_responses')
    .select('document_path, document_name')
    .eq('assignment_id', assignmentId)
    .not('document_path', 'is', null)

  // Answers a person already typed in by hand are off-limits — AI-complete
  // should fill gaps, never overwrite someone's own review/edit of an
  // answer. ai_suggested is null/false for anything a human entered
  // (including a human edit of a prior AI suggestion).
  const { data: existingResponses } = await supabaseAdmin
    .from('questionnaire_responses')
    .select('question_id, answer_text, answer_options, ai_suggested')
    .eq('assignment_id', assignmentId)
  const humanAnsweredQuestionIds = new Set(
    (existingResponses ?? [])
      .filter((r) => !r.ai_suggested && (r.answer_text || (r.answer_options && r.answer_options.length > 0)))
      .map((r) => r.question_id)
  )

  const allDocs: GatheredDoc[] = document_paths.map((d) => ({ ...d, bucket: 'questionnaire-docs', source: 'Uploaded for this AI request' }))
  for (const r of existingDocResponses ?? []) {
    if (!r.document_path || allDocs.some((d) => d.path === r.document_path)) continue
    allDocs.push({ path: r.document_path, bucket: 'questionnaire-docs', type: 'other', name: r.document_name ?? r.document_path, source: 'Answered elsewhere in this questionnaire' })
  }

  // Auto-include the company's document library and anything it has
  // uploaded to any project submission — see gatherCompanyDocuments().
  let autoDocsTruncated = false
  const companyId = await resolveCompanyId(assignment)
  if (companyId) {
    const { docs: autoDocs, truncated } = await gatherCompanyDocuments(companyId)
    autoDocsTruncated = truncated
    for (const d of autoDocs) {
      if (excludedPaths.has(d.path)) continue
      if (allDocs.some((existing) => existing.path === d.path)) continue
      allDocs.push(d)
    }
  }

  if (!allDocs.length) {
    res.status(400).json({ error: 'No documents to work from. Upload at least one document, or answer a document-upload question first.' })
    return
  }

  // Download documents from Supabase Storage and convert to base64
  const documentContents: Array<{ name: string; type: string; base64: string; mimeType: string }> = []
  const skippedDocNames: string[] = []

  for (const doc of allDocs) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(doc.bucket)
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
        : nameLower.endsWith('.csv')
        ? 'text/csv'
        : nameLower.endsWith('.txt')
        ? 'text/plain'
        : nameLower.endsWith('.png')
        ? 'image/png'
        : nameLower.endsWith('.gif')
        ? 'image/gif'
        : nameLower.endsWith('.webp')
        ? 'image/webp'
        : nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')
        ? 'image/jpeg'
        : null

      if (!mimeType) {
        console.warn(`[ai-complete] Unsupported file type for ${doc.name}, skipping`)
        skippedDocNames.push(doc.name)
        continue
      }
      if (mimeType.startsWith('image/') && !matchesImageSignature(Buffer.from(arrayBuffer), mimeType)) {
        console.warn(`[ai-complete] ${doc.name} has a ${mimeType} extension but its contents don't match — skipping (likely a mislabeled or corrupted file)`)
        skippedDocNames.push(doc.name)
        continue
      }
      documentContents.push({ name: doc.name, type: doc.type, base64, mimeType })
    } catch (err) {
      console.warn(`[ai-complete] Error processing document ${doc.name}:`, err)
    }
  }

  if (!documentContents.length) {
    res.status(400).json({ error: 'Could not read any of the uploaded documents.' })
    return
  }

  // Build the questions list for the prompt — skip anything a human has
  // already answered themselves, so the AI never overwrites their work.
  const qqListForAI = qqList.filter((qq) => !humanAnsweredQuestionIds.has(qq.question_id))
  if (!qqListForAI.length) {
    res.json({ success: true, answers_count: 0, responses: [], message: 'Every question already has a manually-entered answer — nothing left for AI to fill in.' })
    return
  }
  const questionsText = qqListForAI
    .map((qq, i) => {
      const q = qq.question as any
      if (!q) return null
      let meta = `Q${i + 1} [ID: ${q.id}] [Type: ${q.answer_type}]`
      if (q.answer_type === 'multi_select' && q.options) {
        meta += ` [Options: ${(q.options as string[]).join(' | ')}]`
      }
      if (q.hint) meta += ` [Hint: ${q.hint}]`
      if (q.ai_extraction_notes) meta += ` [AI extraction notes: ${q.ai_extraction_notes}]`
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
    } else if (doc.mimeType === 'text/csv' || doc.mimeType === 'text/plain') {
      const text = Buffer.from(doc.base64, 'base64').toString('utf-8')
      contentBlocks.push({
        type: 'text',
        text: `[${doc.mimeType === 'text/csv' ? 'CSV' : 'Text'} File Content — ${doc.name}]\n${text}`,
      })
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

CRITICAL SOURCING RULE: Answer strictly and only from what is stated in the attached documents. Never use outside/general knowledge, typical industry standards, or assumptions to fill a gap — if the documents don't address a question, that question must be left unanswered (null), even if you believe you know the likely answer. Every non-null answer must be traceable to a specific document.

Rules:
- For radio_yes_no: answer_text must be exactly "yes" or "no". Also populate company_comments with a brief explanation of what the document shows (e.g. policy number, coverage limits, expiry date, EMR value, etc.)
- For number: answer_text must be a numeric string (e.g. "1.2" or "5"). Populate company_comments with where in the document the value was found.
- For multi_select: answer_options must only contain values from the provided options list. Populate company_comments with supporting details from the document.
- For document_upload: set answer_text to null. Populate company_comments noting whether the relevant document was provided and any key details visible.
- For text_area: provide a concise extracted answer in answer_text.
- If a question has [AI extraction notes], follow that guidance on exactly where/how to locate the answer in the documents.
- If you cannot find the answer in the documents, set answer_text/answer_options to null and use company_comments to explain what additional document or information is needed. Do not guess.
- mojo_feedback must always name the specific source document (by filename) that the answer came from, or state "Not found in provided documents" if left unanswered.
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
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
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
    if (!answer.question_id || humanAnsweredQuestionIds.has(answer.question_id)) continue
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

  // Return the saved responses directly so the frontend can apply them without a refetch
  const { data: savedResponses } = await supabaseAdmin
    .from('questionnaire_responses')
    .select('*')
    .eq('assignment_id', assignmentId)

  console.log(`[ai-complete] Returning ${savedResponses?.length ?? 0} responses from DB`)
  res.json({
    success: true,
    answers_count: savedCount,
    responses: savedResponses ?? [],
    documents_used: allDocs.length,
    documents_truncated: autoDocsTruncated,
    documents_skipped: skippedDocNames,
  })
})

export default router
