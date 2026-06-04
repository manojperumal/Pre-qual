import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ThumbsUp, XCircle, MessageSquare } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  useAssignment,
  useQuestionnaireQuestions,
  useAssignmentResponses,
  useUpdateAssignmentStatus,
  type AssignmentStatus,
  type Response,
} from '@/hooks/useQuestionnaires'
import { supabase } from '@/lib/supabase'

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

  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)

  const responseMap = Object.fromEntries((responses as Response[]).map(r => [r.question_id, r]))

  const basePath = profile?.role === 'trade'
    ? '/trade'
    : profile?.role === 'gc'
    ? '/gc'
    : '/owner'

  async function act(status: AssignmentStatus) {
    if (!assignmentId || !profile) return
    setActing(true)
    try {
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

      {/* Responses */}
      <div className="space-y-4 mb-8">
        {qqList.map((qq, idx) => {
          const q = qq.question
          if (!q) return null
          const r = responseMap[q.id]

          return (
            <div key={qq.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{q.category}</p>
              <p className="text-sm font-semibold text-gray-800 mb-3">
                {idx + 1}. {q.question_text}
              </p>

              {!r ? (
                <p className="text-sm text-gray-400 italic">No answer provided</p>
              ) : q.answer_type === 'radio_yes_no' ? (
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${r.answer_text === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {r.answer_text === 'yes' ? 'Yes' : 'No'}
                </span>
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
            </div>
          )
        })}
      </div>

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
              <ThumbsUp size={15} /> Approve
            </button>
            <button
              onClick={() => act('needs_more_info')}
              disabled={acting}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              <MessageSquare size={15} /> Request More Info
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
