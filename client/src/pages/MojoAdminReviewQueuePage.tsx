import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useFlaggedResponses, useMarkResponseMojoReviewed, FlaggedResponse } from '@/hooks/useQuestionnaires'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, ShieldCheck, CheckCircle, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'

function DocumentLink({ path, name }: { path: string; name: string | null }) {
  const { data } = supabase.storage.from('questionnaire-docs').getPublicUrl(path)
  return (
    <a href={data.publicUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline">
      {name ?? 'View Document'}
    </a>
  )
}

function AnswerDisplay({ r }: { r: FlaggedResponse }) {
  if (r.answer_options?.length) {
    return (
      <div className="flex flex-wrap gap-2">
        {r.answer_options.map((opt) => (
          <span key={opt} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">{opt}</span>
        ))}
      </div>
    )
  }
  if (r.document_path) {
    return <DocumentLink path={r.document_path} name={r.document_name} />
  }
  if (r.answer_text === 'yes' || r.answer_text === 'no') {
    return (
      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${r.answer_text === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
        {r.answer_text === 'yes' ? 'Yes' : 'No'}
      </span>
    )
  }
  return <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.answer_text || <span className="italic text-gray-400">No answer provided</span>}</p>
}

function QueueItem({ item }: { item: FlaggedResponse }) {
  const { profile } = useAuth()
  const markReviewed = useMarkResponseMojoReviewed()
  const [feedback, setFeedback] = useState(item.mojo_feedback ?? '')

  const isReviewed = !!item.mojo_reviewed_at

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">{item.question.category}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{item.question.question_text}</p>
          <p className="text-xs text-gray-500 mt-1">
            {item.assignment.company?.name ?? item.assignment.assignee?.full_name ?? item.assignment.assignee?.email ?? 'Unknown company'}
            {item.assignment.project?.name && <> · {item.assignment.project.name}</>}
            {item.assignment.questionnaire?.name && <> · {item.assignment.questionnaire.name}</>}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${isReviewed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {isReviewed ? 'Reviewed' : 'Pending'}
        </span>
      </div>

      <AnswerDisplay r={item} />

      <div>
        <label className="label text-xs">Mojo Feedback</label>
        <textarea
          rows={2}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Notes for internal tracking or for the company…"
          className="input-field text-sm"
          disabled={isReviewed}
        />
      </div>

      <div className="flex items-center justify-between">
        {isReviewed && item.mojo_reviewed_at && (
          <p className="text-xs text-gray-400">Reviewed {format(new Date(item.mojo_reviewed_at), 'MMM d, yyyy')}</p>
        )}
        <div className="ml-auto">
          {isReviewed ? (
            <button
              onClick={() => markReviewed.mutate({ id: item.id, reviewedBy: profile?.id ?? '', reviewed: false })}
              disabled={markReviewed.isPending}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
            >
              <RotateCcw size={12} />
              Re-open
            </button>
          ) : (
            <button
              onClick={() => markReviewed.mutate({ id: item.id, reviewedBy: profile?.id ?? '', feedback, reviewed: true })}
              disabled={markReviewed.isPending}
              className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
            >
              <CheckCircle size={12} />
              Mark Reviewed
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MojoAdminReviewQueuePage() {
  const { data: items = [], isLoading } = useFlaggedResponses()
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')

  const pending = items.filter((i) => !i.mojo_reviewed_at)
  const reviewed = items.filter((i) => i.mojo_reviewed_at)
  const shown = tab === 'pending' ? pending : reviewed

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Link to="/mojo-admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ArrowLeft size={14} />
            Companies
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ShieldCheck size={22} className="text-brand-600" />
            Mojo Review Queue
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Answers to questions flagged for Mojo review. This runs alongside the company's own approval — it doesn't block it.
          </p>
        </div>

        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab('reviewed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'reviewed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Reviewed ({reviewed.length})
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : shown.length === 0 ? (
          <div className="card p-12 text-center text-gray-500">
            <ShieldCheck size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">
              {tab === 'pending' ? 'Nothing pending review' : 'Nothing reviewed yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {shown.map((item) => (
              <QueueItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
