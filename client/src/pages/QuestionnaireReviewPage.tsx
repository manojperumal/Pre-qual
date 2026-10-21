import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ThumbsUp, XCircle, MessageSquare, Sparkles, AlertTriangle, Flag } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  useAssignment,
  useQuestionnaireQuestions,
  useAssignmentResponses,
  useUpdateAssignmentStatus,
  useUpsertResponse,
  useGenerateReviewSummary,
  type AssignmentStatus,
  type Response,
} from '@/hooks/useQuestionnaires'
import { QuestionNoteThread } from '@/components/QuestionNoteThread'
import { supabase } from '@/lib/supabase'
import { groupByCategory, CATEGORY_COLORS } from '@/lib/questionCategories'

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_more_info: 'More Info Requested',
}

export default function QuestionnaireReviewPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const { data: assignment, isLoading } = useAssignment(assignmentId)
  const { data: qqList = [] } = useQuestionnaireQuestions(assignment?.questionnaire_id)
  const { data: responses = [] } = useAssignmentResponses(assignmentId)
  const updateStatus = useUpdateAssignmentStatus()
  const upsertResponse = useUpsertResponse()
  const generateSummary = useGenerateReviewSummary()

  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)
  const [mojoFeedback, setMojoFeedback] = useState<Record<string, string>>({})
  const [needsClarification, setNeedsClarification] = useState<Record<string, boolean>>({})
  const [reviewStatus, setReviewStatus] = useState<Record<string, 'pending' | 'approved' | 'rejected'>>({})

  const responseMap = Object.fromEntries((responses as Response[]).map(r => [r.question_id, r]))

  function isConditionMet(qq: typeof qqList[number]): boolean {
    if (!qq.depends_on_question_id) return true
    const target = responseMap[qq.depends_on_question_id]
    if (!target) return false
    if (target.answer_options) return target.answer_options.includes(qq.depends_on_value ?? '')
    return target.answer_text === qq.depends_on_value
  }

  const visibleQQList = qqList.filter(isConditionMet)

  // Init mojo feedback + clarification flags from saved responses
  useEffect(() => {
    const feedback: Record<string, string> = {}
    const clarification: Record<string, boolean> = {}
    const status: Record<string, 'pending' | 'approved' | 'rejected'> = {}
    for (const r of responses as Response[]) {
      if (r.mojo_feedback) feedback[r.question_id] = r.mojo_feedback
      if (r.needs_clarification) clarification[r.question_id] = true
      status[r.question_id] = r.review_status ?? 'pending'
    }
    setMojoFeedback(feedback)
    setNeedsClarification(clarification)
    setReviewStatus(status)
  }, [(responses as Response[]).length])

  const basePath = profile?.role === 'trade'
    ? '/trade'
    : profile?.role === 'gc'
    ? '/gc'
    : '/owner'

  async function act(status: AssignmentStatus) {
    if (!assignmentId || !profile) return
    setActing(true)
    try {
      // Save mojo feedback / clarification flag for any question whose
      // reviewer state has changed from what's already saved.
      for (const existing of Object.values(responseMap)) {
        const feedback = mojoFeedback[existing.question_id] ?? ''
        const flagged = needsClarification[existing.question_id] ?? false
        if (feedback === (existing.mojo_feedback ?? '') && flagged === existing.needs_clarification) continue
        await upsertResponse.mutateAsync({
          assignment_id: assignmentId,
          question_id: existing.question_id,
          answer_text: existing.answer_text,
          answer_options: existing.answer_options,
          document_path: existing.document_path,
          document_name: existing.document_name,
          company_comments: existing.company_comments,
          mojo_feedback: feedback || null,
          needs_clarification: flagged,
        })
      }
      await updateStatus.mutateAsync({
        id: assignmentId,
        status,
        reviewerNotes: notes || undefined,
        reviewedBy: profile.id,
      })
      navigate(-1)
    } finally {
      setActing(false)
    }
  }

  function toggleClarification(questionId: string) {
    setNeedsClarification(prev => ({ ...prev, [questionId]: !prev[questionId] }))
  }

  async function setQuestionReviewStatus(questionId: string, status: 'pending' | 'approved' | 'rejected') {
    if (!assignmentId) return
    const existing = responseMap[questionId]
    if (!existing) return
    const next = reviewStatus[questionId] === status ? 'pending' : status
    setReviewStatus(prev => ({ ...prev, [questionId]: next }))
    await upsertResponse.mutateAsync({
      assignment_id: assignmentId,
      question_id: questionId,
      answer_text: existing.answer_text,
      answer_options: existing.answer_options,
      document_path: existing.document_path,
      document_name: existing.document_name,
      company_comments: existing.company_comments,
      mojo_feedback: existing.mojo_feedback,
      needs_clarification: existing.needs_clarification,
      review_status: next,
    })
  }

  async function handleGenerateSummary() {
    if (!assignmentId) return
    await generateSummary.mutateAsync(assignmentId)
  }

  async function getDocUrl(path: string) {
    const { data } = supabase.storage.from('questionnaire-docs').getPublicUrl(path)
    return data.publicUrl
  }

  if (isLoading) return <div className="p-6 text-gray-500">Loading…</div>
  if (!assignment) return <div className="p-6 text-gray-500">Assignment not found.</div>

  const questionnaireName = assignment.questionnaire?.name ?? 'Questionnaire'
  const assigneeName = assignment.assignee?.full_name || assignment.assignee?.email || 'Contractor'
  const isReviewer = profile?.role === 'owner' || profile?.role === 'gc'
  const canAct = isReviewer && (assignment.status === 'submitted' || assignment.status === 'needs_more_info')

  return (
    <div className="p-6 max-w-2xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6">
        <button onClick={() => navigate(-1)} className="hover:text-gray-700">Assignments</button>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">Review</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{questionnaireName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Submitted by <span className="font-medium text-gray-700">{assigneeName}</span>
            {assignment.project && <> · {assignment.project.name}</>}
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[assignment.status]}`}>
          {STATUS_LABELS[assignment.status]}
        </span>
      </div>

      {/* AI summary */}
      {isReviewer && (
        <div className="mb-8 bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-brand-600" />
              <h2 className="text-sm font-semibold text-gray-900">AI Summary</h2>
            </div>
            <button
              onClick={handleGenerateSummary}
              disabled={generateSummary.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Sparkles size={13} />
              {generateSummary.isPending ? 'Analyzing…' : generateSummary.data ? 'Regenerate' : 'Generate Summary'}
            </button>
          </div>

          {!generateSummary.data && !generateSummary.isPending && !generateSummary.error && (
            <p className="text-xs text-gray-500 mt-2">
              Let Mojo AI read every question and answer here and call out what deserves a closer look before you decide.
            </p>
          )}

          {generateSummary.error && (
            <p className="text-xs text-red-600 mt-2">{(generateSummary.error as Error).message}</p>
          )}

          {generateSummary.data && (
            <div className="mt-3 space-y-4">
              {generateSummary.data.attention.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1.5">
                    <AlertTriangle size={13} /> Pay closer attention to
                  </p>
                  <ul className="space-y-1 list-disc list-inside">
                    {generateSummary.data.attention.map((item, i) => (
                      <li key={i} className="text-sm text-gray-700">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1.5">Overall summary</p>
                <ul className="space-y-1 list-disc list-inside">
                  {generateSummary.data.summary.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Responses, grouped by category */}
      {(() => {
        const indexMap = new Map(visibleQQList.map((qq, i) => [qq.id, i]))
        const groups = groupByCategory(visibleQQList, (qq) => qq.question?.category)
        return (
          <div className="space-y-6 mb-8">
            {groups.map((group) => (
              <div key={group.category}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${CATEGORY_COLORS[group.category]}`}>{group.label}</span>
                  <span className="text-xs text-gray-400">{group.items.length} question{group.items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-4">
                  {group.items.map((qq) => {
                    const q = qq.question
                    if (!q) return null
                    const idx = indexMap.get(qq.id) ?? 0
                    const r = responseMap[q.id]

                    const flagged = needsClarification[q.id] ?? false
                    const qStatus = reviewStatus[q.id] ?? 'pending'

                    return (
                      <div
                        key={qq.id}
                        className={`bg-white rounded-xl shadow-sm border p-5 ${
                          qStatus === 'rejected' ? 'border-red-300' : qStatus === 'approved' ? 'border-emerald-300' : flagged ? 'border-amber-300' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <p className="text-sm font-semibold text-gray-800">
                            {idx + 1}. {q.question_text}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {canAct && r ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setQuestionReviewStatus(q.id, 'approved')}
                                  title="Approve this answer"
                                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                    qStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:bg-gray-100'
                                  }`}
                                >
                                  <ThumbsUp size={12} />
                                  {qStatus === 'approved' ? 'Approved' : 'Approve'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuestionReviewStatus(q.id, 'rejected')}
                                  title="Reject this answer"
                                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                    qStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:bg-gray-100'
                                  }`}
                                >
                                  <XCircle size={12} />
                                  {qStatus === 'rejected' ? 'Rejected' : 'Reject'}
                                </button>
                              </>
                            ) : (
                              qStatus !== 'pending' && (
                                <span
                                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                    qStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {qStatus === 'approved' ? <ThumbsUp size={12} /> : <XCircle size={12} />}
                                  {qStatus === 'approved' ? 'Approved' : 'Rejected'}
                                </span>
                              )
                            )}
                            {canAct ? (
                              <button
                                type="button"
                                onClick={() => toggleClarification(q.id)}
                                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                  flagged ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100'
                                }`}
                              >
                                <Flag size={12} />
                                {flagged ? 'Flagged' : 'Flag'}
                              </button>
                            ) : (
                              flagged && (
                                <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                                  <Flag size={12} /> Clarification requested
                                </span>
                              )
                            )}
                          </div>
                        </div>

              {!r ? (
                <p className="text-sm text-gray-400 italic">No answer provided</p>
              ) : q.answer_type === 'radio_yes_no' ? (
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${r.answer_text === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {r.answer_text === 'yes' ? 'Yes' : 'No'}
                </span>
              ) : q.answer_type === 'radio_yes_no_comments' ? (
                <div className="space-y-3">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${r.answer_text === 'yes' ? 'bg-emerald-100 text-emerald-700' : r.answer_text === 'no' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.answer_text === 'yes' ? 'Yes' : r.answer_text === 'no' ? 'No' : 'Not answered'}
                  </span>
                  {r.company_comments && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Company Comments</p>
                      <p className="text-sm text-gray-700">{r.company_comments}</p>
                    </div>
                  )}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-700 mb-1">Mojo Feedback</p>
                    {canAct ? (
                      <textarea
                        rows={2}
                        value={mojoFeedback[q.id] ?? ''}
                        onChange={e => setMojoFeedback(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Enter feedback for this item…"
                        className="w-full bg-white border border-blue-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    ) : (
                      <p className="text-sm text-blue-800">{mojoFeedback[q.id] || <span className="italic text-blue-400">No feedback yet</span>}</p>
                    )}
                  </div>
                </div>
              ) : q.answer_type === 'multi_select' ? (
                <div className="flex flex-wrap gap-2">
                  {(r.answer_options ?? []).map(opt => (
                    <span key={opt} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">{opt}</span>
                  ))}
                </div>
              ) : q.answer_type === 'document_upload' ? (
                r.document_path ? (
                  <DocumentLink path={r.document_path} name={r.document_name} />
                ) : (
                  <p className="text-sm text-gray-400 italic">No document uploaded</p>
                )
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.answer_text || <span className="italic text-gray-400">—</span>}</p>
                        )}

                        {q.answer_type !== 'radio_yes_no_comments' && (flagged || mojoFeedback[q.id]) && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mt-3">
                            <p className="text-xs font-medium text-amber-700 mb-1">Note for Contractor</p>
                            {canAct ? (
                              <textarea
                                rows={2}
                                value={mojoFeedback[q.id] ?? ''}
                                onChange={e => setMojoFeedback(prev => ({ ...prev, [q.id]: e.target.value }))}
                                placeholder="What needs clarification here?"
                                className="w-full bg-white border border-amber-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                            ) : (
                              <p className="text-sm text-amber-800">{mojoFeedback[q.id] || <span className="italic text-amber-400">No note yet</span>}</p>
                            )}
                          </div>
                        )}

                        {assignmentId && <QuestionNoteThread assignmentId={assignmentId} questionId={q.id} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Reviewer notes + actions */}
      {canAct && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Reviewer Notes (optional)</label>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes for the contractor…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={() => act('approved')}
              disabled={acting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <ThumbsUp size={15} /> Accept
            </button>
            <button
              onClick={() => act('needs_more_info')}
              disabled={acting}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              <MessageSquare size={15} /> Send Back for Clarification
            </button>
            <button
              onClick={() => act('rejected')}
              disabled={acting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle size={15} /> Reject
            </button>
          </div>
        </div>
      )}

      {/* Reviewer notes (read-only) */}
      {!canAct && assignment.reviewer_notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">Reviewer Notes</p>
          <p>{assignment.reviewer_notes}</p>
        </div>
      )}
    </div>
  )
}

function DocumentLink({ path, name }: { path: string; name: string | null }) {
  const { data } = supabase.storage.from('questionnaire-docs').getPublicUrl(path)
  return (
    <a
      href={data.publicUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-brand-600 hover:underline"
    >
      {name ?? 'View Document'}
    </a>
  )
}
