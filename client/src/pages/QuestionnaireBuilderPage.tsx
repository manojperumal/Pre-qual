import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  useQuestionBank,
  useQuestionnaire,
  useQuestionnaireQuestions,
  useCreateQuestionnaire,
  useUpdateQuestionnaire,
  useSaveQuestionnaireQuestions,
  Question,
  QuestionCategory,
} from '@/hooks/useQuestionnaires'
import { ChevronRight, Search, Plus, X, GripVertical, Check } from 'lucide-react'

const CATEGORIES: { value: QuestionCategory; label: string; color: string }[] = [
  { value: 'company_info', label: 'Company Info', color: 'bg-blue-100 text-blue-700' },
  { value: 'insurance', label: 'Insurance', color: 'bg-purple-100 text-purple-700' },
  { value: 'safety', label: 'Safety', color: 'bg-red-100 text-red-700' },
  { value: 'ptp', label: 'PTP Program', color: 'bg-orange-100 text-orange-700' },
  { value: 'bonding', label: 'Bonding', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'loss_runs', label: 'Loss Runs', color: 'bg-pink-100 text-pink-700' },
  { value: 'compliance', label: 'Compliance', color: 'bg-green-100 text-green-700' },
]

export default function QuestionnaireBuilderPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const { profile } = useAuth()
  const navigate = useNavigate()

  const { data: allQuestions = [] } = useQuestionBank(profile?.id)
  const { data: existingQ } = useQuestionnaire(id)
  const { data: existingQQs = [] } = useQuestionnaireQuestions(id)

  const createQuestionnaire = useCreateQuestionnaire()
  const updateQuestionnaire = useUpdateQuestionnaire()
  const saveQuestions = useSaveQuestionnaireQuestions()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Question[]>([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<QuestionCategory | 'all'>('all')
  const [saved, setSaved] = useState(false)

  // Pre-fill on edit
  useEffect(() => {
    if (existingQ) { setName(existingQ.name); setDescription(existingQ.description ?? '') }
  }, [existingQ])

  useEffect(() => {
    if (existingQQs.length > 0 && allQuestions.length > 0) {
      const ordered = existingQQs
        .sort((a, b) => a.order_index - b.order_index)
        .map(qq => allQuestions.find(q => q.id === qq.question_id))
        .filter(Boolean) as Question[]
      setSelected(ordered)
    }
  }, [existingQQs, allQuestions])

  const selectedIds = new Set(selected.map(q => q.id))

  const bankFiltered = allQuestions.filter(q => {
    const matchCat = filterCat === 'all' || q.category === filterCat
    const matchSearch = q.question_text.toLowerCase().includes(search.toLowerCase())
    const notSelected = !selectedIds.has(q.id)
    return matchCat && matchSearch && notSelected
  })

  function addQuestion(q: Question) {
    setSelected(prev => [...prev, q])
  }

  function removeQuestion(id: string) {
    setSelected(prev => prev.filter(q => q.id !== id))
  }

  function moveUp(i: number) {
    if (i === 0) return
    setSelected(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  }

  function moveDown(i: number) {
    setSelected(prev => { if (i === prev.length - 1) return prev; const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })
  }

  async function handleSave() {
    if (!profile?.id || !name.trim()) return
    let qId = id
    if (!isEdit) {
      const q = await createQuestionnaire.mutateAsync({ name, description, created_by: profile.id })
      qId = q.id
    } else {
      await updateQuestionnaire.mutateAsync({ id: id!, name, description })
    }
    await saveQuestions.mutateAsync({ questionnaireId: qId!, questionIds: selected.map(q => q.id) })
    setSaved(true)
    setTimeout(() => {
      navigate('/owner/questionnaires')
    }, 800)
  }

  const isSaving = createQuestionnaire.isPending || updateQuestionnaire.isPending || saveQuestions.isPending

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/owner/questionnaires" className="hover:text-brand-600">Questionnaires</Link>
        <ChevronRight size={14} className="text-gray-400" />
        <span className="text-gray-900 font-medium">{isEdit ? 'Edit' : 'New Questionnaire'}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Questionnaire' : 'New Questionnaire'}</h1>
        <p className="mt-1 text-sm text-gray-500">Pick questions from the bank and arrange them in order</p>
      </div>

      {/* Name + description */}
      <div className="card p-6 space-y-4">
        <div>
          <label className="label">Questionnaire Name *</label>
          <input type="text" className="input-field" placeholder="e.g. Standard Pre-Qual 2026" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea rows={2} className="input-field resize-none" placeholder="Describe when to use this questionnaire…" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: question bank */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Question Bank</h2>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-40">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search…" className="input-field pl-8 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input-field py-2 text-sm w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value as any)}>
              <option value="all">All categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div className="card overflow-hidden max-h-[480px] overflow-y-auto divide-y divide-gray-100">
            {bankFiltered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">All questions added or none match</p>
            ) : bankFiltered.map(q => {
              const cat = CATEGORIES.find(c => c.value === q.category)
              return (
                <div key={q.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{q.question_text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {cat && <span className={`text-xs px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>}
                      <span className="text-xs text-gray-400">{q.answer_type.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <button onClick={() => addQuestion(q)} className="flex-shrink-0 p-1.5 text-brand-600 hover:bg-brand-50 rounded transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: selected questions */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">
            Selected Questions
            <span className="ml-2 text-sm font-normal text-gray-400">({selected.length})</span>
          </h2>

          <div className="card overflow-hidden max-h-[520px] overflow-y-auto divide-y divide-gray-100 min-h-[200px]">
            {selected.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">No questions yet</p>
                <p className="text-xs mt-1">Click + to add from the bank</p>
              </div>
            ) : selected.map((q, i) => {
              const cat = CATEGORIES.find(c => c.value === q.category)
              return (
                <div key={q.id} className="flex items-start gap-2 px-4 py-3 hover:bg-gray-50">
                  <div className="flex flex-col gap-0.5 mt-1 flex-shrink-0">
                    <button onClick={() => moveUp(i)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30">
                      <ChevronRight size={12} className="-rotate-90" />
                    </button>
                    <button onClick={() => moveDown(i)} disabled={i === selected.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30">
                      <ChevronRight size={12} className="rotate-90" />
                    </button>
                  </div>
                  <GripVertical size={14} className="text-gray-300 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-400 font-medium">{i + 1}.</span>
                    <p className="text-sm text-gray-800 inline ml-1">{q.question_text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {cat && <span className={`text-xs px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>}
                      <span className="text-xs text-gray-400">{q.answer_type.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <button onClick={() => removeQuestion(q.id)} className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-500 rounded">
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between">
        <Link to="/owner/questionnaires" className="btn-secondary">Cancel</Link>
        <button
          onClick={handleSave}
          disabled={!name.trim() || selected.length === 0 || isSaving}
          className="btn-primary inline-flex items-center gap-2"
        >
          {saved ? <><Check size={16} /> Saved!</> : isSaving ? 'Saving…' : 'Save Questionnaire'}
        </button>
      </div>
    </div>
  )
}
