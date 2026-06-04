import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useQuestionnaires, useDeleteQuestionnaire } from '@/hooks/useQuestionnaires'
import { Plus, ClipboardList, Trash2, Pencil, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

export default function QuestionnairesPage() {
  const { profile } = useAuth()
  const { data: questionnaires = [], isLoading } = useQuestionnaires(profile?.id)
  const deleteQuestionnaire = useDeleteQuestionnaire()

  const basePath = profile?.role === 'gc' ? '/gc' : '/owner'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Questionnaires</h1>
          <p className="mt-1 text-sm text-gray-500">Reusable questionnaire templates you can assign to projects</p>
        </div>
        <div className="flex gap-2">
          <Link to={`${basePath}/questionnaires/assign`} className="btn-secondary inline-flex items-center gap-2 text-sm">
            Assign
          </Link>
          <Link to={`${basePath}/questionnaires/new`} className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus size={16} />
            New Questionnaire
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : questionnaires.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-700">No questionnaires yet</p>
          <p className="text-sm mt-1">Create your first questionnaire template to assign to contractors</p>
          <Link to={`${basePath}/questionnaires/new`} className="btn-primary mt-5 inline-flex items-center gap-2">
            <Plus size={16} />
            Create Questionnaire
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {questionnaires.map((q) => (
            <div key={q.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{q.name}</h3>
                  {q.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{q.description}</p>}
                </div>
                <ClipboardList size={16} className="text-brand-400 flex-shrink-0 mt-0.5" />
              </div>
              <p className="text-xs text-gray-400">Created {format(new Date(q.created_at), 'MMM d, yyyy')}</p>
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <Link
                  to={`${basePath}/questionnaires/${q.id}`}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  <Pencil size={13} />
                  Edit
                </Link>
                <Link
                  to={`${basePath}/questionnaires/assign`}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 ml-auto"
                >
                  Assign <ChevronRight size={12} />
                </Link>
                <button
                  onClick={() => {
                    if (confirm('Delete this questionnaire?')) deleteQuestionnaire.mutate(q.id)
                  }}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
