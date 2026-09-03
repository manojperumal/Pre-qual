import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useQuestionBank, useCreateQuestion, useUpdateQuestion, useDeleteQuestion, useUpdateQuestionMojoReview, useDuplicateQuestion, useQuestionVersions, Question, QuestionCategory, AnswerType } from '@/hooks/useQuestionnaires'
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, Search, ShieldCheck, Copy, History, X as XIcon } from 'lucide-react'

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: 'company_info', label: 'Company Info' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'safety', label: 'Safety' },
  { value: 'ptp', label: 'PTP Program' },
  { value: 'bonding', label: 'Bonding' },
  { value: 'financial', label: 'Financial Review' },
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

const FILE_TYPE_OPTIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']

const CATEGORY_COLORS: Record<QuestionCategory, string> = {
  company_info: 'bg-blue-100 text-blue-700',
  insurance: 'bg-purple-100 text-purple-700',
  safety: 'bg-red-100 text-red-700',
  ptp: 'bg-orange-100 text-orange-700',
  bonding: 'bg-yellow-100 text-yellow-700',
  financial: 'bg-emerald-100 text-emerald-700',
  loss_runs: 'bg-pink-100 text-pink-700',
  compliance: 'bg-green-100 text-green-700',
}

export default function QuestionBankPage() {
  const { profile } = useAuth()
  const { data: questions = [], isLoading } = useQuestionBank(profile?.id)
  const createQuestion = useCreateQuestion()
  const updateQuestion = useUpdateQuestion()
  const deleteQuestion = useDeleteQuestion()
  const updateMojoReview = useUpdateQuestionMojoReview()
  const duplicateQuestion = useDuplicateQuestion()
  const isAdmin = profile?.user_role === 'admin'

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<QuestionCategory | 'all'>('all')
  const [filterTag, setFilterTag] = useState<string | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPrevious, setEditingPrevious] = useState<Question | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyForId, setHistoryForId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  const emptyForm = {
    category: 'company_info' as QuestionCategory,
    question_text: '',
    answer_type: 'radio_yes_no' as AnswerType,
    hint: '',
    ai_extraction_notes: '',
    options: '',
    is_required: true,
    requires_mojo_review: false,
    mojo_review_note: '',
    allowed_file_types: [] as string[],
    tags: [] as string[],
  }

  // Shared form state for both "New Question" and "Edit Question"
  const [form, setForm] = useState(emptyForm)

  function startCreate() {
    setEditingId(null)
    setEditingPrevious(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function startEdit(q: Question) {
    setEditingId(q.id)
    setEditingPrevious(q)
    setForm({
      category: q.category,
      question_text: q.question_text,
      answer_type: q.answer_type,
      hint: q.hint ?? '',
      ai_extraction_notes: q.ai_extraction_notes ?? '',
      options: (q.options ?? []).join('\n'),
      is_required: q.is_required,
      requires_mojo_review: q.requires_mojo_review,
      mojo_review_note: q.mojo_review_note ?? '',
      allowed_file_types: q.allowed_file_types ?? [],
      tags: q.tags ?? [],
    })
    setShowForm(true)
  }

  function startDuplicate(q: Question) {
    if (!profile?.id) return
    duplicateQuestion.mutate({ question: q, createdBy: profile.id })
  }

  function toggleFileType(type: string) {
    setForm((f) => ({
      ...f,
      allowed_file_types: f.allowed_file_types.includes(type)
        ? f.allowed_file_types.filter((t) => t !== type)
        : [...f.allowed_file_types, type],
    }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (!t || form.tags.includes(t)) { setTagInput(''); return }
    setForm((f) => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }

  function removeTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))
  }

  const allTags = Array.from(new Set(questions.flatMap((q) => q.tags ?? []))).sort()

  const filtered = questions.filter((q) => {
    const matchCat = filterCategory === 'all' || q.category === filterCategory
    const matchTag = filterTag === 'all' || (q.tags ?? []).includes(filterTag)
    const matchSearch = q.question_text.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchTag && matchSearch
  })

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    questions: filtered.filter((q) => q.category === cat.value),
  })).filter((g) => g.questions.length > 0)

  async function handleSave() {
    if (!profile?.id || !form.question_text.trim()) return
    const options = form.answer_type === 'multi_select'
      ? form.options.split('\n').map((s) => s.trim()).filter(Boolean)
      : undefined

    const allowedFileTypes = form.answer_type === 'document_upload' ? form.allowed_file_types : undefined

    if (editingId && editingPrevious) {
      await updateQuestion.mutateAsync({
        id: editingId,
        previous: editingPrevious,
        changedBy: profile.id,
        category: form.category,
        question_text: form.question_text.trim(),
        answer_type: form.answer_type,
        hint: form.hint.trim() || undefined,
        ai_extraction_notes: form.ai_extraction_notes.trim() || undefined,
        options,
        is_required: form.is_required,
        allowed_file_types: allowedFileTypes,
        tags: form.tags,
      })
      await updateMojoReview.mutateAsync({ id: editingId, requiresMojoReview: form.requires_mojo_review, note: form.mojo_review_note })
    } else {
      await createQuestion.mutateAsync({
        category: form.category,
        question_text: form.question_text.trim(),
        answer_type: form.answer_type,
        hint: form.hint.trim() || undefined,
        ai_extraction_notes: form.ai_extraction_notes.trim() || undefined,
        options,
        is_required: form.is_required,
        requires_mojo_review: form.requires_mojo_review,
        mojo_review_note: form.mojo_review_note.trim() || undefined,
        allowed_file_types: allowedFileTypes,
        tags: form.tags,
        created_by: profile.id,
      })
    }
    setForm(emptyForm)
    setEditingId(null)
    setEditingPrevious(null)
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
          <p className="mt-1 text-sm text-gray-500">{questions.length} questions · {questions.filter(q => q.is_global).length} global · {questions.filter(q => !q.is_global).length} custom</p>
        </div>
        <button onClick={() => (showForm ? setShowForm(false) : startCreate())} className="btn-primary inline-flex items-center gap-2 text-sm">
          <Plus size={16} />
          Add Question
        </button>
      </div>

      {/* Add/Edit question form */}
      {showForm && (
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">{editingId ? 'Edit Question' : 'New Question'}</h2>
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
          {form.answer_type === 'document_upload' && (
            <div>
              <label className="label">Allowed File Types <span className="text-gray-400 font-normal">(none selected = any file type)</span></label>
              <div className="flex flex-wrap gap-2">
                {FILE_TYPE_OPTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleFileType(type)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium uppercase transition-colors ${
                      form.allowed_file_types.includes(type)
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    .{type}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label">Tags <span className="text-gray-400 font-normal">(optional, for filtering/search)</span></label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-gray-400 hover:text-gray-600">
                    <XIcon size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1"
                placeholder="Type a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              />
              <button type="button" onClick={addTag} className="btn-secondary text-sm">Add</button>
            </div>
          </div>
          <div>
            <label className="label">Hint / Helper Text <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" className="input-field" placeholder="Shown below the question to guide the respondent" value={form.hint} onChange={e => setForm(f => ({ ...f, hint: e.target.value }))} />
          </div>
          <div>
            <label className="label">AI Extraction Notes <span className="text-gray-400 font-normal">(optional, internal — guides Mojo AI, never shown to the respondent)</span></label>
            <textarea
              rows={2}
              className="input-field resize-none"
              placeholder="e.g. Check the EMR value in Section 3 of the Loss Runs report, not the summary page"
              value={form.ai_extraction_notes}
              onChange={e => setForm(f => ({ ...f, ai_extraction_notes: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_required" checked={form.is_required} onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} className="rounded border-gray-300" />
            <label htmlFor="is_required" className="text-sm text-gray-700">Required</label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="requires_mojo_review" checked={form.requires_mojo_review} onChange={e => setForm(f => ({ ...f, requires_mojo_review: e.target.checked }))} className="rounded border-gray-300" />
              <label htmlFor="requires_mojo_review" className="text-sm text-gray-700">Requires Mojo Review</label>
            </div>
            {form.requires_mojo_review && (
              <div>
                <label className="label">Why does this need Mojo review? <span className="text-gray-400 font-normal">(optional, shown to the Mojo reviewer and to the respondent)</span></label>
                <textarea
                  rows={2}
                  className="input-field resize-none"
                  placeholder="e.g. High-risk answer that needs a compliance check before it counts as final"
                  value={form.mojo_review_note}
                  onChange={e => setForm(f => ({ ...f, mojo_review_note: e.target.value }))}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={!form.question_text.trim() || createQuestion.isPending || updateQuestion.isPending} className="btn-primary">
              {createQuestion.isPending || updateQuestion.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Save Question'}
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
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilterTag('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterTag === 'all' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
              All tags
            </button>
            {allTags.map((tag) => (
              <button key={tag} onClick={() => setFilterTag(tag)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterTag === tag ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
                {tag}
              </button>
            ))}
          </div>
        )}
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
                          {q.requires_mojo_review && (
                            <span
                              className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded"
                              title={q.mojo_review_note ?? undefined}
                            >
                              <ShieldCheck size={11} />
                              Mojo Review
                            </span>
                          )}
                          {q.version > 1 && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">v{q.version}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-gray-500">{ANSWER_TYPES.find(a => a.value === q.answer_type)?.label}</span>
                          {q.options && <span className="text-xs text-gray-400">{(q.options as string[]).join(', ')}</span>}
                          {q.allowed_file_types && q.allowed_file_types.length > 0 && (
                            <span className="text-xs text-gray-400">{q.allowed_file_types.map((t) => `.${t}`).join(', ')} only</span>
                          )}
                          {(q.tags ?? []).map((tag) => (
                            <span key={tag} className="text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                        {q.hint && expandedId === q.id && (
                          <p className="text-xs text-gray-500 mt-1 italic">{q.hint}</p>
                        )}
                        {q.ai_extraction_notes && expandedId === q.id && (
                          <p className="text-xs text-brand-600 mt-1 italic">AI notes: {q.ai_extraction_notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(q.hint || q.ai_extraction_notes) && (
                          <button onClick={() => setExpandedId(expandedId === q.id ? null : q.id)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                            {expandedId === q.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        {!q.is_global && isAdmin && (
                          <button
                            onClick={() => updateMojoReview.mutate({ id: q.id, requiresMojoReview: !q.requires_mojo_review })}
                            className={`p-1.5 rounded ${q.requires_mojo_review ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-brand-600'}`}
                            title={q.requires_mojo_review ? 'Disable Mojo Review' : 'Require Mojo Review'}
                          >
                            <ShieldCheck size={14} />
                          </button>
                        )}
                        {!q.is_global && isAdmin && (
                          <button onClick={() => startEdit(q)} className="p-1.5 text-gray-400 hover:text-brand-600 rounded">
                            <Pencil size={14} />
                          </button>
                        )}
                        {q.version > 1 && (
                          <button onClick={() => setHistoryForId(q.id)} className="p-1.5 text-gray-400 hover:text-brand-600 rounded" title="Version history">
                            <History size={14} />
                          </button>
                        )}
                        <button onClick={() => startDuplicate(q)} className="p-1.5 text-gray-400 hover:text-brand-600 rounded" title="Duplicate question">
                          <Copy size={14} />
                        </button>
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

      {historyForId && (
        <QuestionHistoryModal questionId={historyForId} onClose={() => setHistoryForId(null)} />
      )}
    </div>
  )
}

function QuestionHistoryModal({ questionId, onClose }: { questionId: string; onClose: () => void }) {
  const { data: versions = [], isLoading } = useQuestionVersions(questionId)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Version History</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XIcon size={16} />
          </button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" /></div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-gray-500">No prior versions recorded.</p>
        ) : (
          <div className="space-y-3">
            {versions.map((v) => (
              <div key={v.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Version {v.version}</span>
                  <span className="text-xs text-gray-400">{new Date(v.changed_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-800">{v.question_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
