import { useCallback, useState } from 'react'
import { Search } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { ErrorNote, Spinner, StatusBadge } from '@/components/ui'
import { GateCard, type Card } from '@/components/GateCard'
import { QrScanner } from '@/components/QrScanner'
import type { ProjectDetail } from './ProjectPage'

export function GateTab({ project }: { project: ProjectDetail }) {
  const [card, setCard] = useState<Card | null>(null)
  const [results, setResults] = useState<Card[]>([])
  const [q, setQ] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const canRevoke = project.role !== 'trade'

  const lookup = useCallback(
    async (raw: string) => {
      setBusy(true)
      setError(null)
      try {
        setCard(await staffApi.get<Card>(`/gate/lookup?token=${encodeURIComponent(raw)}&project_id=${project.id}`))
        setResults([])
      } catch (e) {
        setCard(null)
        setError(e)
      } finally {
        setBusy(false)
      }
    },
    [project.id]
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px),1fr]">
      <div className="space-y-4">
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">Check a worker</h2>
          <QrScanner onScan={lookup} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (token.trim()) lookup(token.trim())
            }}
          >
            <input className="input-field font-mono text-xs" placeholder="…or paste pass code / link" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn-secondary">Check</button>
          </form>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              try {
                const r = await staffApi.get<Card[]>(`/projects/${project.id}/gate/search?q=${encodeURIComponent(q)}`)
                setResults(r)
                if (r.length === 1) setCard(r[0])
              } catch (err) {
                setError(err)
              }
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <input className="input-field pl-8" placeholder="Name or last 4 of phone" value={q} onChange={(e) => setQ(e.target.value)} minLength={2} required />
            </div>
            <button className="btn-secondary">Search</button>
          </form>
          {results.length > 1 && (
            <ul className="divide-y rounded border">
              {results.map((r) => (
                <li key={r.id}>
                  <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => setCard(r)}>
                    <span>
                      <span className="font-medium">{r.full_name}</span>
                      <span className="block text-xs text-gray-500">{r.company_name}</span>
                    </span>
                    <StatusBadge status={r.effective_status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Workers can also show their pass to any phone camera; it opens a live status page. Status changes (completion, revocation, expiry) show up within a minute.
        </p>
      </div>
      <div>
        <ErrorNote error={error} />
        {busy && <Spinner />}
        {card && <GateCard card={card} canRevoke={canRevoke} onChange={setCard} />}
        {!card && !busy && !error && (
          <div className="grid h-full min-h-[240px] place-items-center rounded-lg border-2 border-dashed text-gray-500">Scan a pass or search by name</div>
        )}
      </div>
    </div>
  )
}
