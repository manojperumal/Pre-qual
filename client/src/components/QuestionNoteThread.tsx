import { useState } from 'react'
import { MessageCircle, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useResponseNotes, useAddResponseNote } from '@/hooks/useQuestionnaires'
import { roleLabel } from '@/lib/roleLabels'
import { format } from 'date-fns'

interface QuestionNoteThreadProps {
  assignmentId: string
  questionId: string
}

// Append-only note thread on a single question — an audit trail both
// parties (contractor and reviewer) can add to, distinct from the
// single-value company_comments/mojo_feedback fields which only hold the
// latest value.
export function QuestionNoteThread({ assignmentId, questionId }: QuestionNoteThreadProps) {
  const { profile } = useAuth()
  const { data: notes = [] } = useResponseNotes(assignmentId, questionId)
  const addNote = useAddResponseNote()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  async function handleAdd() {
    if (!draft.trim() || !profile?.id) return
    await addNote.mutateAsync({ assignmentId, questionId, authorId: profile.id, note: draft.trim() })
    setDraft('')
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        <MessageCircle size={13} />
        Notes {notes.length > 0 && `(${notes.length})`}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {notes.length === 0 && (
            <p className="text-xs text-gray-400 italic">No notes yet on this question.</p>
          )}
          {notes.map((n) => {
            const isMe = n.author_id === profile?.id
            return (
              <div key={n.id} className={`rounded-lg px-3 py-2 text-sm ${isMe ? 'bg-brand-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-0.5">
                  <span className="font-medium text-gray-700">
                    {isMe ? 'You' : n.author?.full_name || n.author?.email || 'Someone'}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span>{roleLabel(n.author?.role)}</span>
                  <span className="text-gray-300">·</span>
                  <span>{format(new Date(n.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
                <p className="text-gray-800 whitespace-pre-wrap">{n.note}</p>
              </div>
            )
          })}

          <div className="flex items-start gap-2 pt-1">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim() || addNote.isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50 flex-shrink-0"
            >
              <Send size={12} />
              {addNote.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
