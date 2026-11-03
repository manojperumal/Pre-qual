import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Upload } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fmtDate, type Status } from '@/lib/status'
import { Empty, ErrorNote, PageLoader, StatusBadge } from '@/components/ui'
import type { ProjectDetail } from './ProjectPage'

interface Roster {
  company: { id: string; name: string }
  workers: {
    id: string
    full_name: string
    phone: string
    crew: string | null
    trade: string | null
    start_date: string | null
    effective_status: Status
    expires_at: string | null
    remaining: string[]
    needs_attestation: boolean
    needs_photo_match: boolean
  }[]
  invited: { id: string; phone: string; full_name: string | null; crew: string | null; trade: string | null; start_date: string | null; sent_at: string | null }[]
}

/** Parse "phone, name, crew, trade, start-date" per line (CSV paste or upload). */
function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^phone\b/i.test(l))
    .map((l) => {
      const [phone, full_name, crew, trade, start_date] = l.split(/[,\t;]/).map((s) => s?.trim() ?? '')
      return { phone, full_name: full_name || undefined, crew: crew || undefined, trade: trade || undefined, start_date: /^\d{4}-\d{2}-\d{2}$/.test(start_date || '') ? start_date : undefined }
    })
}

/** FR-20: each subcontractor sees only its own workers, with bulk invite. */
export function RosterTab({ project }: { project: ProjectDetail }) {
  const isTrade = project.role === 'trade'
  const trades = project.companies.filter((c) => c.type === 'trade')
  const [companyId, setCompanyId] = useState(isTrade ? '' : trades[0]?.id ?? '')
  const { data, error, loading, reload } = useAsync(
    () => (isTrade || companyId ? staffApi.get<Roster>(`/projects/${project.id}/roster${companyId ? `?company_id=${companyId}` : ''}`) : Promise.resolve(null)),
    [project.id, companyId],
    15000
  )
  const [text, setText] = useState('')
  const [defaults, setDefaults] = useState({ crew: '', trade: '', start_date: '' })
  const [result, setResult] = useState<any>(null)
  const [sendErr, setSendErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const entries = parseLines(text)

  return (
    <div className="space-y-5">
      {!isTrade && (
        <div className="flex items-center gap-2">
          <label className="label mb-0">Company</label>
          <select className="input-field w-auto" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {trades.length === 0 && <option value="">No subcontractors on this project</option>}
            {trades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <ErrorNote error={error} />
      {loading && <PageLoader />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
          <div className="card overflow-hidden">
            <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold">
              {data.company.name} — {data.workers.length} registered, {data.invited.length} invited (not started)
            </div>
            {data.workers.length + data.invited.length === 0 ? (
              <div className="p-4">
                <Empty title="No workers yet">Invite your crew with the form — each person gets a text with the orientation link.</Empty>
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Worker</th>
                    <th className="px-3 py-2">Crew</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">What remains</th>
                    <th className="px-3 py-2">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.workers.map((w) => (
                    <tr key={w.id}>
                      <td className="px-3 py-2">
                        <Link to={`/staff/workers/${w.id}`} className="font-medium text-brand-700 hover:underline">
                          {w.full_name}
                        </Link>
                        <span className="block text-xs text-gray-500">
                          {w.phone} · start {fmtDate(w.start_date)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{w.crew ?? '—'}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={w.effective_status} />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {w.remaining.length > 0
                          ? `${w.remaining.length} part(s): ${w.remaining.slice(0, 2).join(', ')}${w.remaining.length > 2 ? '…' : ''}`
                          : w.needs_attestation
                            ? 'Sign attestation'
                            : w.needs_photo_match
                              ? 'Photo check at gate'
                              : '—'}
                      </td>
                      <td className="px-3 py-2">{fmtDate(w.expires_at)}</td>
                    </tr>
                  ))}
                  {data.invited.map((i) => (
                    <tr key={i.id} className="text-gray-500">
                      <td className="px-3 py-2">
                        {i.full_name ?? 'Invited worker'}
                        <span className="block text-xs">{i.phone}</span>
                      </td>
                      <td className="px-3 py-2">{i.crew ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs">Invited {i.sent_at ? 'and texted' : ''}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">Has not opened the link</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form
            className="card space-y-3 p-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setSendErr(null)
              try {
                const r = await staffApi.post(`/projects/${project.id}/invites`, {
                  company_id: isTrade ? undefined : companyId,
                  entries: entries.map((en) => ({
                    ...en,
                    crew: en.crew ?? (defaults.crew || undefined),
                    trade: en.trade ?? (defaults.trade || undefined),
                    start_date: en.start_date ?? (defaults.start_date || undefined),
                  })),
                })
                setResult(r)
                setText('')
                reload()
              } catch (err) {
                setSendErr(err)
              } finally {
                setBusy(false)
              }
            }}
          >
            <h3 className="font-semibold">Invite crew</h3>
            <p className="text-xs text-gray-600">
              One worker per line: <span className="font-mono">phone, name, crew, trade, YYYY-MM-DD</span>. Only the phone is required. Paste from a spreadsheet or upload a CSV.
            </p>
            <textarea className="input-field font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'555-201-0001, Luis Ortega, Crew A\n555-201-0002, Maria Diaz'} />
            <label className="btn-secondary w-full cursor-pointer">
              <Upload className="h-4 w-4" /> Upload CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) setText(await f.text())
                }}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input className="input-field" placeholder="Crew (all)" value={defaults.crew} onChange={(e) => setDefaults({ ...defaults, crew: e.target.value })} />
              <input className="input-field" placeholder="Trade (all)" value={defaults.trade} onChange={(e) => setDefaults({ ...defaults, trade: e.target.value })} />
              <input className="input-field" type="date" value={defaults.start_date} onChange={(e) => setDefaults({ ...defaults, start_date: e.target.value })} />
            </div>
            <ErrorNote error={sendErr} />
            {result && (
              <p className="rounded bg-green-50 p-2 text-sm text-green-900">
                Invited {result.invited} worker(s){result.results.some((r: any) => !r.ok) ? `; ${result.results.filter((r: any) => !r.ok).length} invalid number(s) skipped` : ''}. Link: <span className="font-mono text-xs">{result.link}</span>
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || entries.length === 0 || (!isTrade && !companyId)}>
              <Send className="h-4 w-4" /> Text {entries.length || ''} invite{entries.length === 1 ? '' : 's'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
