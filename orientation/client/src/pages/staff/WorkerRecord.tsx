import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Circle, Download } from 'lucide-react'
import { downloadExport, staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fmtDateTime } from '@/lib/status'
import { ErrorNote, PageLoader } from '@/components/ui'
import { GateCard, type Card } from '@/components/GateCard'
import { useState } from 'react'

interface Record_ {
  role: string
  card: Card
  revoke_reason: string | null
  modules: { moduleId: string; title: string; layer: string; state: string; superseded: boolean; current: { id: string; version: number }; validCompletion: { version: number; completedAt: string } | null; expiresAt: string | null }[]
  ready_to_attest: boolean
  attempts: { check_id: string; attempt_no: number; correct: boolean; language: string; created_at: string; title: string; version: number }[]
  completions: { completed_at: string; mode: string; language: string; version_id: string; version: number; content_hash: string; title: string; layer: string }[]
  attestations: { id: string; statement: string; language: string; signed_name: string; created_at: string }[]
  audit: { id: number; created_at: string; actor_type: string; actor_label: string | null; event: string; payload: any; hash: string }[]
}

/** Full orientation record for one worker on one project (FR-24/FR-25). */
export default function WorkerRecord() {
  const { id = '' } = useParams()
  const { data, error, loading, setData } = useAsync(() => staffApi.get<Record_>(`/enrollments/${id}`), [id], 30000)
  const [exportErr, setExportErr] = useState<unknown>(null)
  if (loading) return <PageLoader />
  if (!data) return <ErrorNote error={error} />
  const wrong = data.attempts.filter((a) => !a.correct).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/staff/projects/${data.card.project_id}`} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> {data.card.project_name}
        </Link>
        <div className="flex gap-2">
          {(['pdf', 'csv'] as const).map((f) => (
            <button key={f} className="btn-secondary" onClick={() => downloadExport({ scope: 'worker', id, format: f }).catch(setExportErr)}>
              <Download className="h-4 w-4" /> Audit record ({f.toUpperCase()})
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={exportErr} />
      <GateCard card={data.card} canRevoke={data.role !== 'trade'} onChange={(c) => setData({ ...data, card: { ...data.card, ...c } })} />
      {data.revoke_reason && <p className="text-sm text-red-800">Reason recorded: {data.revoke_reason}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b px-4 py-3 font-semibold">Required orientation ({data.modules.filter((m) => m.state === 'complete').length}/{data.modules.length})</h2>
          <ul className="divide-y text-sm">
            {data.modules.map((m) => (
              <li key={m.moduleId} className="flex items-start gap-2 px-4 py-2">
                {m.state === 'complete' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 text-gray-300" />}
                <span className="flex-1">
                  <span className="font-medium">{m.title}</span> <span className="text-xs text-gray-500">({m.layer}, current v{m.current.version})</span>
                  <span className="block text-xs text-gray-600">
                    {m.validCompletion ? `Completed v${m.validCompletion.version} ${fmtDateTime(m.validCompletion.completedAt)} · expires ${fmtDateTime(m.expiresAt)}` : m.superseded ? 'Content updated — needs to be redone' : m.state === 'delta' ? 'Needs the update (delta)' : 'Not completed'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="border-b px-4 py-3 font-semibold">Attestations</h2>
          {data.attestations.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">{data.ready_to_attest ? 'All modules done — waiting for the worker to sign.' : 'Not signed yet.'}</p>}
          <ul className="divide-y text-sm">
            {data.attestations.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <p className="font-serif text-base italic">{a.signed_name}</p>
                <p className="text-xs text-gray-500">
                  {fmtDateTime(a.created_at)} · {a.language.toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-gray-700">{a.statement}</p>
              </li>
            ))}
          </ul>
          <h2 className="border-y px-4 py-3 font-semibold">Comprehension</h2>
          <p className="px-4 py-3 text-sm text-gray-700">
            {data.attempts.length} answer(s) recorded, {wrong} needed re-teaching.
          </p>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b px-4 py-3 font-semibold">Audit trail</h2>
        <table className="min-w-full text-sm">
          <tbody className="divide-y">
            {data.audit.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-4 py-1.5 text-xs text-gray-500">{fmtDateTime(a.created_at)}</td>
                <td className="px-4 py-1.5 font-medium">{a.event.replace(/_/g, ' ')}</td>
                <td className="px-4 py-1.5 text-xs text-gray-600">{a.payload?.title ?? a.payload?.reason ?? (a.payload?.to ? `→ ${a.payload.to.replace(/_/g, ' ')}` : '')}</td>
                <td className="px-4 py-1.5 text-xs text-gray-500">{a.actor_label ?? a.actor_type}</td>
                <td className="px-4 py-1.5 font-mono text-[10px] text-gray-400">{a.hash.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
