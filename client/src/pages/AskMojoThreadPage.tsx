import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  useAskMojoThread,
  useAskMojoMessages,
  useAskMojoReferenceDocs,
  useUploadAskMojoReferenceDoc,
  useSendAskMojoMessage,
  usePublishAskMojoDraft,
} from '@/hooks/useAskMojo'
import { Markdown } from '@/components/Markdown'
import { ChevronRight, Sparkles, ArrowUp, Upload, FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Paperclip } from 'lucide-react'

function stripDraftTags(content: string): string {
  return content.replace(/<document>[\s\S]*?<\/document>/, '📄 *Updated the current draft — see the panel above.*').trim() || content
}

const COMPOSER_MAX_HEIGHT = 200

export default function AskMojoThreadPage() {
  const { threadId } = useParams<{ threadId: string }>()
  const { profile } = useAuth()
  const location = useLocation()
  const basePath = '/' + location.pathname.split('/')[1]
  const isAdmin = profile?.user_role === 'admin'

  const { data: thread } = useAskMojoThread(threadId)
  const { data: messages = [] } = useAskMojoMessages(threadId)
  const { data: refDocs = [] } = useAskMojoReferenceDocs(threadId)
  const uploadDoc = useUploadAskMojoReferenceDoc()
  const sendMessage = useSendAskMojoMessage()
  const publishDraft = usePublishAskMojoDraft()

  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(true)
  const [publishName, setPublishName] = useState('')
  const [showPublishForm, setShowPublishForm] = useState(false)
  const [showRefDocs, setShowRefDocs] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT) + 'px'
  }, [input])

  async function handleSend() {
    if (!threadId || !input.trim() || sendMessage.isPending) return
    setSendError(null)
    const message = input.trim()
    setInput('')
    try {
      await sendMessage.mutateAsync({ threadId, message })
    } catch (err: any) {
      setSendError(err?.message || 'Ask Mojo failed to respond. Please try again.')
      setInput(message)
    }
  }

  async function handleUpload(file: File) {
    if (!threadId) return
    try {
      await uploadDoc.mutateAsync({ threadId, file })
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message ?? 'Please try again.'))
    }
  }

  async function handlePublish() {
    if (!threadId || !thread?.current_draft || !profile?.id || !publishName.trim()) return
    await publishDraft.mutateAsync({
      threadId,
      companyId: thread.company_id,
      documentType: thread.document_type,
      documentName: publishName.trim(),
      draft: thread.current_draft,
      uploadedBy: profile.id,
    })
    setShowPublishForm(false)
  }

  if (!thread) {
    return <div className="p-6 text-gray-500">Loading…</div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="space-y-4 pb-4">
        <nav className="flex items-center gap-1.5 text-sm text-gray-500">
          <Link to={`${basePath}/ask-mojo`} className="hover:text-brand-600 transition-colors">Ask Mojo</Link>
          <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-gray-900 font-medium truncate">{thread.title}</span>
        </nav>

        {thread.status === 'published' && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 size={16} />
            Published to your company's Document Library.
          </div>
        )}

        {thread.current_draft && (
          <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
            <button
              onClick={() => setDraftOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText size={15} className="text-brand-500" />
                Current Draft
              </span>
              {draftOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {draftOpen && (
              <div className="p-5 space-y-4">
                <div className="max-h-96 overflow-y-auto text-sm text-gray-700 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <Markdown>{thread.current_draft}</Markdown>
                </div>
                {isAdmin && thread.status === 'drafting' && (
                  showPublishForm ? (
                    <div className="flex gap-2 items-center">
                      <input
                        className="input-field flex-1"
                        placeholder="Document name, e.g. 2026 Safety Manual"
                        value={publishName}
                        onChange={(e) => setPublishName(e.target.value)}
                      />
                      <button onClick={handlePublish} disabled={!publishName.trim() || publishDraft.isPending} className="btn-primary text-sm px-4">
                        {publishDraft.isPending ? 'Publishing…' : 'Confirm'}
                      </button>
                      <button onClick={() => setShowPublishForm(false)} className="btn-secondary text-sm px-3">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowPublishForm(true)} className="btn-primary text-sm inline-flex items-center gap-2">
                      <CheckCircle2 size={15} />
                      Publish to Document Library
                    </button>
                  )
                )}
                {!isAdmin && thread.status === 'drafting' && (
                  <p className="text-xs text-gray-400">Only a company admin can publish this draft to the Document Library.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="min-h-[50vh]">
        {messages.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center text-gray-400 px-6">
            <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
              <Sparkles size={22} className="text-brand-500" />
            </div>
            <p className="text-sm max-w-sm">
              Tell Ask Mojo what you're building — your trade, company size, and any specific hazards or equipment involved.
            </p>
          </div>
        )}

        <div className="space-y-6 pb-4">
          {messages.map((m) =>
            m.role === 'assistant' ? (
              <div key={m.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={14} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0 text-[0.925rem] text-gray-800">
                  <Markdown>{stripDraftTags(m.content)}</Markdown>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-gray-100 text-gray-800 px-4 py-2.5 text-[0.925rem] whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            )
          )}
          {sendMessage.isPending && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Sparkles size={14} className="text-brand-500 animate-pulse" />
              </div>
              <p className="text-sm text-gray-400 italic pt-1">Ask Mojo is thinking…</p>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 bg-[#F3F4F6] pt-3 pb-2">
        {sendError && (
          <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2 text-xs mb-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            {sendError}
          </div>
        )}

        <div className="border border-gray-300 rounded-2xl bg-white shadow-sm focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-shadow">
          <textarea
            ref={textareaRef}
            rows={1}
            className="w-full resize-none border-0 focus:outline-none focus:ring-0 px-4 pt-3.5 pb-1 text-[0.925rem] rounded-2xl"
            style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
            placeholder="Message Ask Mojo…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowRefDocs((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              <Paperclip size={13} />
              {refDocs.length > 0 ? `${refDocs.length} reference doc${refDocs.length !== 1 ? 's' : ''}` : 'Add reference document'}
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMessage.isPending}
              className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>

        {showRefDocs && (
          <div className="mt-2 border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-600">Reference Documents</h3>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file)
                    e.target.value = ''
                  }}
                />
                <span className="inline-flex items-center gap-1.5 text-xs btn-secondary py-1 px-2 cursor-pointer">
                  <Upload size={12} />
                  {uploadDoc.isPending ? 'Uploading…' : 'Upload'}
                </span>
              </label>
            </div>
            {refDocs.length === 0 ? (
              <p className="text-xs text-gray-400">None uploaded — Ask Mojo will draft from scratch based on your answers.</p>
            ) : (
              <div className="space-y-1">
                {refDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <FileText size={12} className="text-brand-400 flex-shrink-0" />
                    {doc.file_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
