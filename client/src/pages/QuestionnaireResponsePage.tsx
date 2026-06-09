import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, CheckCircle2, Clock, Sparkles, Upload, X, FileText, AlertCircle, Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  useAssignment,
  useQuestionnaireQuestions,
  useAssignmentResponses,
  useUpsertResponse,
  useUpdateAssignmentStatus,
  useAICompleteQuestionnaire,
  type Response,
} from '@/hooks/useQuestionnaires'
import { supabase } from '@/lib/supabase'

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'safety_manual', label: 'Safety Manual' },
  { value: 'osha_log', label: 'OSHA Log (300/301)' },
  { value: 'coi', label: 'Certificate of Insurance (COI)' },
  { value: 'loss_runs', label: 'Loss Runs' },
  { value: 'other', label: 'Other Supporting Document' },
]

interface UploadedDoc {
  path: string
  type: string
  name: string
}

export default function QuestionnaireResponsePage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const { data: assignment, isLoading: loadingAssignment } = useAssignment(assignmentId)
  const { data: qqList = [], isLoading: loadingQuestions } = useQuestionnaireQuestions(
    assignment?.questionnaire_id
  )
  const { data: existingResponses = [] } = useAssignmentResponses(assignmentId)
  const upsertResponse = useUpsertResponse()
  const updateStatus = useUpdateAssignmentStatus()
  const aiComplete = useAICompleteQuestionnaire()

  const [answers, setAnswers] = useState<Record<string, { text?: string; options?: string[]; docName?: string; docPath?: string; companyComments?: string; mojoFeedback?: string; aiSuggested?: boolean }>>({})

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // AI document upload state
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState('safety_manual')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuccess, setAiSuccess] = useState(false)

  useEffect(() => {
    if (existingResponses.length === 0) return
    const init: typeof answers = {}
    for (const r of existingResponses as Response[]) {
      init[r.question_id] = {
        text: r.answer_text ?? undefined,
        options: r.answer_options ?? undefined,
        docName: r.document_name ?? undefined,
        docPath: r.document_path ?? undefined,
        companyComments: r.company_comments ?? undefined,
        mojoFeedback: r.mojo_feedback ?? undefined,
        aiSuggested: r.ai_suggested ?? false,
      }
    }
    setAnswers(init)
  }, [existingResponses.length])

  const isReadOnly = assignment?.status === 'submitted' || assignment?.status === 'approved'
  const basePath = profile?.role === 'gc' ? '/gc' : '/trade'

  const answeredCount = qqList.filter(qq => {
    const a = answers[qq.question_id]
    if (!a) return false
    if (a.text && a.text.trim()) return true
    if (a.options && a.options.length > 0) return true
    if (a.docPath) return true
    return false
  }).length

  function setTextAnswer(questionId: string, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], text: value } }))
  }

  function toggleOption(questionId: string, option: string) {
    setAnswers(prev => {
      const cur = prev[questionId]?.options ?? []
      const next = cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option]
      return { ...prev, [questionId]: { ...prev[questionId], options: next } }
    })
  }

  async function handleFileUpload(questionId: string, file: File) {
    if (!assignmentId) return
    const path = `${assignmentId}/${questionId}/${file.name}`
    const { error } = await supabase.storage.from('questionnaire-docs').upload(path, file, { upsert: true })
    if (error) {
      alert('Upload failed: ' + error.message)
      return
    }
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], docPath: path, docName: file.name },
    }))
  }

  async function handleAIDocUpload(file: File) {
    if (!assignmentId) return
    setUploadingDoc(true)
    try {
      const path = `${assignmentId}/ai-docs/${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('questionnaire-docs').upload(path, file, { upsert: true })
      if (error) {
        alert('Upload failed: ' + error.message)
        return
      }
      setUploadedDocs(prev => [...prev, { path, type: selectedDocType, name: file.name }])
    } finally {
      setUploadingDoc(false)
    }
  }

  function removeAIDoc(path: string) {
    setUploadedDocs(prev => prev.filter(d => d.path !== path))
  }

  async function handleAIComplete() {
    if (!assignmentId || !uploadedDocs.length) return
    setAiError(null)
    setAiSuccess(false)
    try {
      await aiComplete.mutateAsync({ assignmentId, documentPaths: uploadedDocs })
      setAiSuccess(true)
    } catch (err: any) {
      setAiError(err.message ?? 'AI completion failed')
    }
  }

  async function saveProgress() {
    if (!assignmentId) return
    setSaving(true)
    try {
      for (const qq of qqList) {
        const a = answers[qq.question_id]
        if (!a) continue
        await upsertResponse.mutateAsync({
          assignment_id: assignmentId,
          question_id: qq.question_id,
          answer_text: a.text ?? null,
          answer_options: a.options ?? null,
          document_path: a.docPath ?? null,
          document_name: a.docName ?? null,
          company_comments: a.companyComments ?? null,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!assignmentId || !profile) return
    setSubmitting(true)
    try {
      await saveProgress()
      await updateStatus.mutateAsync({ id: assignmentId, status: 'submitted' })
      navigate(`${basePath}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingAssignment || loadingQuestions) {
    return <div className="p-6 text-gray-500">Loading…</div>
  }

  if (!assignment) {
    return <div className="p-6 text-gray-500">Assignment not found.</div>
  }

  const questionnaireName = assignment.questionnaire?.name ?? 'Questionnaire'

  return (
    <div className="p-6 max-w-2xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6">
        <Link to={basePath} className="hover:text-gray-700">Dashboard</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">{questionnaireName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{questionnaireName}</h1>
          {assignment.project && (
            <p className="text-sm text-gray-500 mt-0.5">Project: {assignment.project.name}</p>
          )}
        </div>
        {isReadOnly && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full">
            <CheckCircle2 size={14} /> Submitted
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className="bg-brand-600 h-2 rounded-full transition-all"
            style={{ width: qqList.length ? `${(answeredCount / qqList.length) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{answeredCount} / {qqList.length} answered</span>
      </div>

      {/* Due date */}
      {assignment.due_date && (
        <p className="flex items-center gap-1 text-xs text-amber-600 mb-4">
          <Clock size={13} /> Due {new Date(assignment.due_date).toLocaleDateString()}
        </p>
      )}

      {/* AI Document Upload Section */}
      {!isReadOnly && (
        <div className="mb-6 bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-900">Complete with AI</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Upload your company documents (Safety Manual, OSHA logs, COIs, Loss Runs) and let Mojo AI fill in the questionnaire for you. Review the answers before submitting.
          </p>

          {/* Upload controls */}
          <div className="flex gap-2 items-center mb-3">
            <select
              value={selectedDocType}
              onChange={e => setSelectedDocType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 flex-1"
            >
              {DOCUMENT_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                disabled={uploadingDoc}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleAIDocUpload(file)
                  e.target.value = ''
                }}
              />
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                <Upload size={14} />
                {uploadingDoc ? 'Uploading…' : 'Add File'}
              </span>
            </label>
          </div>

          {/* Uploaded docs list */}
          {uploadedDocs.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {uploadedDocs.map(doc => (
                <div key={doc.path} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                  <FileText size={14} className="text-brand-500 flex-shrink-0" />
                  <span className="text-xs text-gray-700 flex-1 truncate">{doc.name}</span>
                  <span className="text-xs text-gray-400">{DOCUMENT_TYPE_OPTIONS.find(o => o.value === doc.type)?.label}</span>
                  <button onClick={() => removeAIDoc(doc.path)} className="text-gray-400 hover:text-gray-600 ml-1">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {aiError && (
            <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2 text-xs mb-3">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              {aiError}
            </div>
          )}

          {aiSuccess && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-xs mb-3">
              <CheckCircle2 size={14} />
              AI has filled in the answers below. Please review and edit before submitting.
            </div>
          )}

          <button
            onClick={handleAIComplete}
            disabled={!uploadedDocs.length || aiComplete.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles size={15} />
            {aiComplete.isPending ? 'Analyzing documents…' : `Complete with AI (${uploadedDocs.length} doc${uploadedDocs.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-5">
        {qqList.map((qq, idx) => {
          const q = qq.question
          if (!q) return null
          const a = answers[q.id] ?? {}

          return (
            <div key={qq.id} className={`bg-white rounded-xl shadow-sm border p-5 ${a.aiSuggested ? 'border-brand-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-gray-800">
                  {idx + 1}. {q.question_text}
                  {qq.is_required && <span className="text-red-500 ml-1">*</span>}
                </p>
                {a.aiSuggested && (
                  <span className="inline-flex items-center gap-1 text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full flex-shrink-0">
                    <Sparkles size={11} /> AI
                  </span>
                )}
              </div>
              {q.hint && <p className="text-xs text-gray-400 mb-3">{q.hint}</p>}

              {/* Radio yes/no */}
              {q.answer_type === 'radio_yes_no' && (
                <div className="flex gap-4">
                  {['yes', 'no'].map(v => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={q.id}
                        value={v}
                        checked={a.text === v}
                        onChange={() => !isReadOnly && setTextAnswer(q.id, v)}
                        disabled={isReadOnly}
                        className="accent-brand-600"
                      />
                      <span className="text-sm capitalize">{v}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Radio yes/no with comment fields */}
              {q.answer_type === 'radio_yes_no_comments' && (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    {['yes', 'no'].map(v => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={q.id}
                          value={v}
                          checked={a.text === v}
                          onChange={() => !isReadOnly && setTextAnswer(q.id, v)}
                          disabled={isReadOnly}
                          className="accent-brand-600"
                        />
                        <span className="text-sm capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company Comments</label>
                    <textarea
                      rows={2}
                      value={a.companyComments ?? ''}
                      onChange={e => !isReadOnly && setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], companyComments: e.target.value } }))}
                      disabled={isReadOnly}
                      placeholder="Add any relevant comments…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-blue-700 mb-1">Mojo Feedback</p>
                    <p className="text-xs text-blue-500 italic">Feedback will be provided by Mojo after review.</p>
                  </div>
                </div>
              )}

              {/* Multi-select */}
              {q.answer_type === 'multi_select' && (
                <div className="space-y-2">
                  {(q.options ?? []).map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(a.options ?? []).includes(opt)}
                        onChange={() => !isReadOnly && toggleOption(q.id, opt)}
                        disabled={isReadOnly}
                        className="accent-brand-600"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Text area */}
              {q.answer_type === 'text_area' && (
                <textarea
                  rows={3}
                  value={a.text ?? ''}
                  onChange={e => !isReadOnly && setTextAnswer(q.id, e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Enter your answer…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
                />
              )}

              {/* Number */}
              {q.answer_type === 'number' && (
                <input
                  type="number"
                  value={a.text ?? ''}
                  onChange={e => !isReadOnly && setTextAnswer(q.id, e.target.value)}
                  disabled={isReadOnly}
                  placeholder="0"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 w-40"
                />
              )}

              {/* Document upload */}
              {q.answer_type === 'document_upload' && (
                <div>
                  {a.docName ? (
                    <p className="text-sm text-brand-600">{a.docName}</p>
                  ) : (
                    !isReadOnly && (
                      <input
                        type="file"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(q.id, file)
                        }}
                        className="text-sm"
                      />
                    )
                  )}
                </div>
              )}

              {/* Mojo Feedback */}
              {a.mojoFeedback && (
                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <Info size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{a.mojoFeedback}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {!isReadOnly && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={saveProgress}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Progress'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || answeredCount === 0}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  )
}
