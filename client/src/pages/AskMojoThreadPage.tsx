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
import { ChevronRight, Sparkles, Send, Upload, FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

function stripDraftTags(content: string): { text: string; hadDraft: boolean } {
  const hadDraft = /<document>[\s\S]*?<\/document>/.test(content)
  const text = content.replace(/<document>[\s\S]*?<\/document>/, '📄 *Updated the current draft — see the panel above.*').trim()
  return { text: text || content, hadDraft }
}

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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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
    <div className="max-w-3xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to={`${basePath}/ask-mojo`} className="hover:text-brand-600 transition-colors">Ask Mojo</Link>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-medium truncate">{thread.title}</span>
      </nav>

      {thread.status === 'published' && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 size={16} />
          Published to your company's Document Library.
        </div>
      )}

      {thread.current_draft && (
        <div className="card overflow-hidden">
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
              <div className="max-h-96 overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4 border border-gray-100">
                {thread.current_draft}
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

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Reference Documents</h2>
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
            <span className="inline-flex items-center gap-1.5 text-xs btn-secondary py-1.5 px-2.5 cursor-pointer">
              <Upload size={13} />
              {uploadDoc.isPending ? 'Uploading…' : 'Upload'}
            </span>
          </label>
        </div>
        {refDocs.length === 0 ? (
          <p className="text-xs text-gray-400">None uploaded — Ask Mojo will draft from scratch based on your answers.</p>
        ) : (
          <div className="space-y-1.5">
            {refDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 text-xs text-gray-600">
                <FileText size={13} className="text-brand-400 flex-shrink-0" />
                {doc.file_name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="space-y-4 max-h-[28rem] overflow-y-auto mb-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              <Sparkles size={28} className="mx-auto mb-2 text-gray-300" />
              Tell Ask Mojo what you're building — your trade, company size, and any specific hazards or equipment involved.
            </div>
          )}
          {messages.map((m) => {
            const { text } = m.role === 'assistant' ? stripDraftTags(m.content) : { text: m.content }
            return (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {text}
                </div>
              </div>
            )
          })}
          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-400 rounded-xl px-4 py-2.5 text-sm italic">Ask Mojo is thinking…</div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {sendError && (
          <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2 text-xs mb-3">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            {sendError}
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            rows={2}
            className="input-field flex-1 resize-none"
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
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            className="btn-primary px-4 self-end inline-flex items-center gap-2"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
