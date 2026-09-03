import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

const SYSTEM_PROMPT = `You are Ask Mojo, a veteran safety professional with 20+ years of field experience across general industry and construction, embedded inside a contractor pre-qualification platform. You help Owners, General Contractors, and Trade subcontractors draft safety manuals, standard operating procedures (SOPs), and similar safety-program documents.

How to work:
- If you don't yet know enough to draft (company trade, size, specific equipment/hazards, which OSHA standards apply — general industry 1910 vs. construction 1926), ask focused clarifying questions before writing. Don't draft from a guess.
- If the user uploaded a reference document, treat it as the baseline — refine, restructure, and fill gaps in it rather than starting over, unless they ask you to start fresh.
- Write like a real safety document, not a generic essay: clear sections such as Purpose, Scope, Responsibilities, Procedures/Requirements, PPE, Training, and Revision History, using the specific hazards and equipment relevant to the user's trade.
- Whenever you produce or revise the FULL current draft, wrap the ENTIRE document (not a diff, not an excerpt) in <document></document> tags, with nothing else inside those tags but the document itself. Only do this when you're actually presenting the current complete draft — ordinary clarifying questions or brief remarks should NOT be wrapped in these tags.
- Always end the document itself (inside the tags) with this exact line as its own paragraph: "This document was drafted with AI assistance and must be reviewed and approved by a qualified safety professional before official use."
- Be direct and practical. You're a working safety professional, not a generic assistant — write with the specificity and field judgment that implies.`

const MAX_REFERENCE_DOCS = 5

async function getCompanyId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('profiles').select('new_company_id').eq('id', userId).single()
  return data?.new_company_id ?? null
}

function extractDraft(text: string): string | null {
  const match = text.match(/<document>([\s\S]*?)<\/document>/)
  return match ? match[1].trim() : null
}

/**
 * POST /api/ask-mojo/threads/:threadId/messages
 * Sends a chat message in an Ask Mojo thread and gets the agent's reply.
 * Reference documents already uploaded to the thread are re-attached to
 * every call so the model can keep referring back to them.
 */
const messageSchema = z.object({ message: z.string().min(1) })

router.post('/threads/:threadId/messages', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { threadId } = req.params
  const parsed = messageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const companyId = await getCompanyId(req.userId!)
  if (!companyId) {
    res.status(400).json({ error: 'No company found for this account' })
    return
  }

  const { data: thread, error: threadErr } = await supabaseAdmin
    .from('ask_mojo_threads')
    .select('id, company_id')
    .eq('id', threadId)
    .single()
  if (threadErr || !thread || thread.company_id !== companyId) {
    res.status(404).json({ error: 'Thread not found' })
    return
  }

  const { data: history, error: historyErr } = await supabaseAdmin
    .from('ask_mojo_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (historyErr) {
    res.status(500).json({ error: 'Failed to load conversation history' })
    return
  }

  const { data: refDocs } = await supabaseAdmin
    .from('ask_mojo_reference_documents')
    .select('file_name, storage_path')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(MAX_REFERENCE_DOCS)

  // Save the user's message first so it's persisted even if the AI call fails.
  const { error: userInsertErr } = await supabaseAdmin
    .from('ask_mojo_messages')
    .insert({ thread_id: threadId, role: 'user', content: parsed.data.message })
  if (userInsertErr) {
    res.status(500).json({ error: 'Failed to save message' })
    return
  }

  // Build the outgoing message list: prior turns as plain text, reference
  // documents (if any) attached to the current turn so the model can keep
  // reading them throughout the conversation.
  const anthropicMessages: Anthropic.MessageParam[] = (history ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const currentTurnContent: Anthropic.MessageParam['content'] = []
  for (const doc of refDocs ?? []) {
    try {
      const { data, error } = await supabaseAdmin.storage.from('prequal-documents').download(doc.storage_path)
      if (error || !data) continue
      const arrayBuffer = await data.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const nameLower = doc.file_name.toLowerCase()
      if (nameLower.endsWith('.pdf')) {
        currentTurnContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any)
      } else if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
        try {
          const result = await mammoth.extractRawText({ buffer: Buffer.from(base64, 'base64') })
          currentTurnContent.push({ type: 'text', text: `[Reference document — ${doc.file_name}]\n${result.value}` })
        } catch {
          currentTurnContent.push({ type: 'text', text: `[Reference document — ${doc.file_name}: could not extract text]` })
        }
      } else {
        currentTurnContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } })
      }
    } catch (err) {
      console.warn(`[ask-mojo] Could not attach reference doc ${doc.file_name}:`, err)
    }
  }
  currentTurnContent.push({ type: 'text', text: parsed.data.message })
  anthropicMessages.push({ role: 'user', content: currentTurnContent })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let replyText: string
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    })
    replyText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  } catch (err: any) {
    console.error('[ask-mojo] Claude API error:', err)
    res.status(500).json({ error: 'Ask Mojo failed to respond: ' + (err.message ?? 'Unknown error') })
    return
  }

  const { data: savedMessage, error: assistantInsertErr } = await supabaseAdmin
    .from('ask_mojo_messages')
    .insert({ thread_id: threadId, role: 'assistant', content: replyText })
    .select()
    .single()
  if (assistantInsertErr) {
    res.status(500).json({ error: 'Failed to save response' })
    return
  }

  const draft = extractDraft(replyText)
  if (draft) {
    await supabaseAdmin.from('ask_mojo_threads').update({ current_draft: draft }).eq('id', threadId)
  }

  res.json({ message: savedMessage, draft_updated: !!draft })
})

export default router
