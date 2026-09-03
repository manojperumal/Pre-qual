import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useAskMojoThreads, useCreateAskMojoThread, AskMojoDocumentType } from '@/hooks/useAskMojo'
import { Sparkles, Plus, FileText, CheckCircle2, X } from 'lucide-react'
import { format } from 'date-fns'

const DOCUMENT_TYPE_OPTIONS: { value: AskMojoDocumentType; label: string }[] = [
  { value: 'safety_manual', label: 'Safety Manual' },
  { value: 'sop', label: 'Standard Operating Procedure' },
  { value: 'other', label: 'Other Safety Document' },
]

export default function AskMojoPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const basePath = '/' + location.pathname.split('/')[1]

  const companyId = profile?.new_company_id ?? null
  const { data: threads = [], isLoading } = useAskMojoThreads(companyId)
  const createThread = useCreateAskMojoThread()

  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState<AskMojoDocumentType>('safety_manual')

  async function handleCreate() {
    if (!companyId || !profile?.id || !title.trim()) return
    const thread = await createThread.mutateAsync({
      company_id: companyId,
      created_by: profile.id,
      title: title.trim(),
      document_type: documentType,
    })
    navigate(`${basePath}/ask-mojo/${thread.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 flex-shrink-0">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ask Mojo</h1>
            <p className="mt-0.5 text-sm text-gray-500">Draft safety manuals and SOPs with an AI safety professional</p>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
          <Plus size={16} />
          New Document
        </button>
      </div>

      {showNew && (
        <div className="card p-6 space-y-4 border-brand-200">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Start a New Document</h2>
            <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className="label" htmlFor="am-title">What are you building?</label>
            <input
              id="am-title"
              className="input-field"
              placeholder="e.g. Fall Protection SOP, 2026 Safety Manual"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="am-type">Document Type</label>
            <select
              id="am-type"
              className="input-field"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as AskMojoDocumentType)}
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!title.trim() || createThread.isPending}
              className="btn-primary text-sm"
            >
              {createThread.isPending ? 'Starting…' : 'Start Chatting'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : threads.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <Sparkles size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-700">No documents yet</p>
          <p className="text-sm mt-1">Start a safety manual or SOP from scratch, or upload an existing document to refine</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {threads.map((thread) => (
            <Link key={thread.id} to={`${basePath}/ask-mojo/${thread.id}`} className="card-hover p-5 block">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{thread.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{DOCUMENT_TYPE_OPTIONS.find((o) => o.value === thread.document_type)?.label}</p>
                </div>
                <FileText size={18} className="text-brand-400 flex-shrink-0 mt-0.5" />
              </div>
              <div className="flex items-center justify-between mt-4">
                {thread.status === 'published' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={11} /> Published
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Drafting</span>
                )}
                <p className="text-xs text-gray-400">{format(new Date(thread.updated_at), 'MMM d, yyyy')}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
