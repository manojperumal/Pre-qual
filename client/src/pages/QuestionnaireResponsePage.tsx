import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  useAssignment,
  useQuestionnaireQuestions,
  useAssignmentResponses,
  useUpsertResponse,
  useUpdateAssignmentStatus,
  type Response,
} from '@/hooks/useQuestionnaires'
import { supabase } from '@/lib/supabase'

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

  // Local answer state keyed by question_id
  const [answers, setAnswers] = useState<Record<string, { text?: string; options?: string[]; docName?: string; docPath?: string }>>({})
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Initialise from existing responses
  useEffect(() => {
    if (existingResponses.length === 0) return
    const init: typeof answers = {}
    for (const r of existingResponses as Response[]) {
      init[r.question_id] = {
        text: r.answer_text ?? undefined,
        options: r.answer_options ?? undefined,
        docName: r.document_name ?? undefined,
        docPath: r.document_path ?? undefined,
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

      {/* Questions */}
      <div className="space-y-5">
        {qqList.map((qq, idx) => {
          const q = qq.question
          if (!q) return null
          const a = answers[q.id] ?? {}

          return (
            <div key={qq.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-800 mb-1">
                {idx + 1}. {q.question_text}
                {qq.is_required && <span className="text-red-500 ml-1">*</span>}
              </p>
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
