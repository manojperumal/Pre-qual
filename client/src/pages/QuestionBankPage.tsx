import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useQuestionBank, useCreateQuestion, useDeleteQuestion, Question, QuestionCategory, AnswerType } from '@/hooks/useQuestionnaires'
import { Plus, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react'

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: 'company_info', label: 'Company Info' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'safety', label: 'Safety' },
  { value: 'ptp', label: 'PTP Program' },
  { value: 'bonding', label: 'Bonding' },
  { value: 'loss_runs', label: 'Loss Runs' },
  { value: 'compliance', label: 'Compliance' },
]

const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'radio_yes_no', label: 'Yes / No' },
  { value: 'text_area', label: 'Text Answer' },
  { value: 'number', label: 'Number' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'document_upload', label: 'Document Upload' },
]

const CATEGORY_COLORS: Record<QuestionCategory, string> = {
  company_info: 'bg-blue-100 text-blue-700',
  insurance: 'bg-purple-100 text-purple-700',
  safety: 'bg-red-100 text-red-700',
  ptp: 'bg-orange-100 text-orange-700',
  bonding: 'bg-yellow-100 text-yellow-700',
  loss_runs: 'bg-pink-100 text-pink-700',
  compliance: 'bg-green-100 text-green-700',
}

export default function QuestionBankPage() {
  const { profile } = useAuth()
  const { data: questions = [], isLoading } = useQuestionBank(profile?.id)
  const createQuestion = useCreateQuestion()
  const deleteQuestion = useDeleteQuestion()

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<QuestionCategory | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New question form state
  const [form, setForm] = useState({
    category: 'company_info' as QuestionCategory,
    question_text: '',
    answer_type: 'radio_yes_no' as AnswerType,
    hint: '',
    options: '',
    is_required: true,
  })

  const filtered = questions.filter((q) => {
    const matchCat = filterCategory === 'all' || q.category === filterCategory
    const matchSearch = q.question_text.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    questions: filtered.filter((q) => q.category === cat.value),
  })).filter((g) => g.questions.length > 0)

  async function handleCreate() {
    if (!profile?.id || !form.question_text.trim()) return
    await createQuestion.mutateAsync({
      category: form.category,
      question_text: form.question_text.trim(),
      answer_type: form.answer_type,
      hint: form.hint.trim() || undefined,
      options: form.answer_type === 'multi_select'
        ? form.options.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined,
      is_required: form.is_required,
      created_by: profile.id,
    })
    setForm({ category: 'company_info', question_text: '', answer_type: 'radio_yes_no', hint: '', options: '', is_required: true })
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
          <p className="mt-1 text-sm text-gray-500">{questions.length} questions · {questions.filter(q => q.is_global).length} global · {questions.filter(q => !q.is_global).length} custom</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary inline-flex items-center gap-2 text-sm">
          <Plus size={16} />
          Add Question
        </button>
      </div>

      {/* Add question form */}
      {showForm && (
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">New Question</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as QuestionCategory }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Answer Type</label>
              <select className="input-field" value={form.answer_type} onChange={e => setForm(f => ({ ...f, answer_type: e.target.value as AnswerType }))}>
                {ANSWER_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Question Text *</label>
            <textarea rows={2} className="input-field resize-none" placeholder="Enter the question..." value={form.question_text} onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))} />
          </div>
          {form.answer_type === 'multi_select' && (
            <div>
              <label className="label">Options <span className="text-gray-400 font-normal">(one per line)</span></label>
              <textarea rows={4} className="input-field resize-none" placeholder={"Option A\nOption B\nOption C"} value={form.options} onChange={e => setForm(f => ({ ...f, options: e.target.value }))} />
            </div>
          )}
          <div>
            <label className="label">Hint / Helper Text <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" className="input-field" placeholder="Shown below the question to guide the respondent" value={form.hint} onChange={e => setForm(f => ({ ...f, hint: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_required" checked={form.is_required} onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} className="rounded border-gray-300" />
            <label htmlFor="is_required" className="text-sm text-gray-700">Required</label>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={!form.question_text.trim() || createQuestion.isPending} className="btn-primary">
              {createQuestion.isPending ? 'Saving…' : 'Save Question'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search questions…" className="input-field pl-8 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            All
          </button>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setFilterCategory(c.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCategory === c.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Questions grouped by category */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : grouped.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">No questions found.</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.value} className="card overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[group.value]}`}>{group.label}</span>
                <span className="text-xs text-gray-400">{group.questions.length} questions</span>
              </div>
              <div className="divide-y divide-gray-100">
                {group.questions.map(q => (
                  <div key={q.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-gray-900">{q.question_text}</p>
                          {q.is_global && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">Global</span>}
                          {q.is_required && <span className="text-xs text-gray-400">Required</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">{ANSWER_TYPES.find(a => a.value === q.answer_type)?.label}</span>
                          {q.options && <span className="text-xs text-gray-400">{(q.options as string[]).join(', ')}</span>}
                        </div>
                        {q.hint && expandedId === q.id && (
                          <p className="text-xs text-gray-500 mt-1 italic">{q.hint}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {q.hint && (
                          <button onClick={() => setExpandedId(expandedId === q.id ? null : q.id)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                            {expandedId === q.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        {!q.is_global && (
                          <button onClick={() => deleteQuestion.mutate(q.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
