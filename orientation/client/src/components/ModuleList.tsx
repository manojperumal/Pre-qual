import { Link } from 'react-router-dom'
import { ChevronRight, Lock } from 'lucide-react'

export interface ModuleSummary {
  id: string
  layer: 'baseline' | 'project' | 'trade'
  title: string
  trade: string | null
  section_key: string | null
  project_id: string | null
  published: { id: string; version: number; published_at: string; change_policy: string } | null
  draft: { id: string; version: number } | null
}

export function ModuleList({ modules, readOnly, sectionTitle }: { modules: ModuleSummary[]; readOnly?: boolean; sectionTitle?: (k: string | null) => string | null }) {
  if (modules.length === 0) return <p className="px-4 py-3 text-sm text-gray-500">None yet.</p>
  return (
    <ul className="divide-y">
      {modules.map((m) => (
        <li key={m.id}>
          <Link to={`/staff/modules/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-gray-900">{m.title}</span>
              <span className="block text-xs text-gray-500">
                {m.layer === 'trade' ? `Trade: ${m.trade}` : sectionTitle?.(m.section_key) ?? (m.layer === 'baseline' ? 'Owner baseline' : 'Project')}
              </span>
            </span>
            {m.published ? (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">Published v{m.published.version}</span>
            ) : (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Not published</span>
            )}
            {m.draft && !readOnly && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Draft v{m.draft.version}</span>}
            {readOnly ? <Lock className="h-4 w-4 text-gray-400" aria-label="Owner-controlled" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </Link>
        </li>
      ))}
    </ul>
  )
}
