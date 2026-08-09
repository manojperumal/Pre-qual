import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useQuestionnaires, useCreateAssignment, useCreateAssignmentRule } from '@/hooks/useQuestionnaires'
import { useProjects, useCompanyProjects, useOwnerGCs, useOwnerTrades, useGCTrades } from '@/hooks/useProjects'

type Scope = 'project_all' | 'company'

export default function AssignQuestionnairePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { projectId: routeProjectId } = useParams()
  const [searchParams] = useSearchParams()
  const preselectedQuestionnaireId = searchParams.get('questionnaireId') ?? ''

  const isOwner = profile?.role === 'owner'
  // The real tenant id (companies.id), needed for company-wide project lookups
  const companyId = profile?.new_company_id ?? (profile as any)?.company_id ?? null

  const { data: questionnaires = [] } = useQuestionnaires(profile?.id)
  const { data: ownerProjects = [] } = useProjects(isOwner ? profile?.id : undefined)
  const { data: memberProjects = [] } = useCompanyProjects(!isOwner ? (companyId ?? undefined) : undefined)
  const projects = isOwner ? ownerProjects : memberProjects
  const createAssignment = useCreateAssignment()
  const createRule = useCreateAssignmentRule()

  // Ecosystem companies this Owner/GC can target directly, regardless of project
  const { data: ownerGcRows = [] } = useOwnerGCs(isOwner ? profile?.id : undefined)
  const { data: ownerTradeRows = [] } = useOwnerTrades(isOwner ? profile?.id : undefined)
  const { data: gcTradeRows = [] } = useGCTrades(!isOwner ? profile?.id : undefined)
  const ecosystemRows = isOwner ? [...ownerGcRows, ...ownerTradeRows] : gcTradeRows
  const ecosystemCompanies = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of ecosystemRows) {
      if (r.companyId && !seen.has(r.companyId)) seen.set(r.companyId, r.companyName ?? 'Unnamed company')
    }
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [ecosystemRows])

  const [questionnaireId, setQuestionnaireId] = useState(preselectedQuestionnaireId)
  const [scope, setScope] = useState<Scope>('project_all')
  const [projectId, setProjectId] = useState(routeProjectId ?? '')
  const [tieToProject, setTieToProject] = useState(!!routeProjectId)
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const basePath = isOwner ? '/owner' : '/gc'

  function toggleCompany(id: string) {
    setCompanyIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const canSubmit =
    !!questionnaireId &&
    (scope === 'project_all' ? !!projectId : companyIds.length > 0 && (!tieToProject || !!projectId))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !canSubmit) return
    setSubmitting(true)
    try {
      if (scope === 'project_all') {
        await createRule.mutateAsync({
          questionnaire_id: questionnaireId,
          project_id: projectId,
          assigned_by: profile.id,
          due_date: dueDate || undefined,
        })
      } else {
        for (const company_id of companyIds) {
          await createAssignment.mutateAsync({
            questionnaire_id: questionnaireId,
            company_id,
            assigned_by: profile.id,
            project_id: tieToProject ? projectId : undefined,
            due_date: dueDate || undefined,
          })
        }
      }
      navigate(`${basePath}/questionnaires`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6">
        <Link to={`${basePath}/questionnaires`} className="hover:text-gray-700">Questionnaires</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">Assign</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Assign Questionnaire</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Questionnaire */}
        <div>
          <label className="label">Questionnaire *</label>
          <select
            required
            value={questionnaireId}
            onChange={e => setQuestionnaireId(e.target.value)}
            className="input-field"
          >
            <option value="">Select a questionnaire…</option>
            {questionnaires.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
          {questionnaires.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              No questionnaires yet.{' '}
              <Link to={`${basePath}/questionnaires/new`} className="text-brand-600 hover:underline">Create one first</Link>
            </p>
          )}
        </div>

        {/* Scope */}
        {!routeProjectId && (
          <div>
            <label className="label">Who has to complete this?</label>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" className="mt-1" checked={scope === 'project_all'} onChange={() => setScope('project_all')} />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Entire project</span>
                  <span className="block text-xs text-gray-500">Every company currently on the project — and any added later — must complete it.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" className="mt-1" checked={scope === 'company'} onChange={() => setScope('company')} />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Specific companies</span>
                  <span className="block text-xs text-gray-500">Pick one or more companies, tied to a project or standing across all your projects with them.</span>
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Project (required for project_all; optional-tie for company scope) */}
        {!routeProjectId && (scope === 'project_all' || tieToProject) && (
          <div>
            <label className="label">Project {scope === 'project_all' ? '*' : ''}</label>
            <select
              required={scope === 'project_all'}
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="input-field"
            >
              <option value="">Select a project…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Company picker + project tie toggle for company scope */}
        {!routeProjectId && scope === 'company' && (
          <>
            <div>
              <label className="label">Companies *</label>
              {ecosystemCompanies.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No companies in your ecosystem yet.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {ecosystemCompanies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={companyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="rounded border-gray-300"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={tieToProject}
                onChange={e => { setTieToProject(e.target.checked); if (!e.target.checked) setProjectId('') }}
                className="rounded border-gray-300"
              />
              Tie to a specific project
              <span className="text-xs text-gray-400">(otherwise applies across all your projects with them)</span>
            </label>
          </>
        )}

        {/* Due date */}
        <div>
          <label className="label">Due Date (optional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="input-field"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting || !canSubmit} className="btn-primary">
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
          <Link to={`${basePath}/questionnaires`} className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
