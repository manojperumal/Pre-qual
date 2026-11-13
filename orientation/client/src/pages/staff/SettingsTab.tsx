import { useState } from 'react'
import QRCode from 'react-qr-code'
import { Copy, KeyRound, Printer } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { ErrorNote } from '@/components/ui'
import type { ProjectDetail } from './ProjectPage'

export function SettingsTab({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const s = project.settings
  const [form, setForm] = useState({ expiry_days: s.expiry_days?.toString() ?? '', open_days_before_start: String(s.open_days_before_start) })
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const apiBase = (import.meta.env.VITE_ORIENTATION_API_URL || window.location.origin).replace(/\/$/, '')

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Site poster</h2>
        <p className="text-sm text-gray-600">Post this at the site office and gate. Workers scan it to register — no app, no password.</p>
        <div id="poster" className="mx-auto max-w-xs rounded-lg border-4 border-mojo-dark p-5 text-center">
          <p className="text-lg font-extrabold">SITE ORIENTATION</p>
          <p className="text-sm font-semibold text-gray-600">ORIENTACIÓN DE LA OBRA</p>
          <p className="mt-1 font-semibold">{project.name}</p>
          <div className="mx-auto my-3 w-44 bg-white p-2">
            <QRCode value={s.join_url} style={{ width: '100%', height: 'auto' }} />
          </div>
          <p className="text-xs text-gray-600">Scan with your phone camera · Escanee con la cámara de su teléfono</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-widest">{s.join_code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(s.join_url)}>
            <Copy className="h-4 w-4" /> Copy link
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              const html = document.getElementById('poster')!.outerHTML
              const w = window.open('', '_blank')!
              w.document.write(`<html><head><title>Orientation poster</title><style>body{font-family:system-ui;display:flex;justify-content:center;padding:40px} #poster{border:6px solid #111;padding:32px;text-align:center;width:420px} svg{width:300px!important;height:300px!important}</style></head><body>${html}</body></html>`)
              w.document.close()
              w.print()
            }}
          >
            <Printer className="h-4 w-4" /> Print poster
          </button>
        </div>
      </section>

      <div className="space-y-6">
        <form
          className="card space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              await staffApi.put(`/projects/${project.id}/settings`, {
                expiry_days: form.expiry_days ? Number(form.expiry_days) : null,
                open_days_before_start: Number(form.open_days_before_start),
              })
              setSaved(true)
              onChange()
            } catch (err) {
              setError(err)
            }
          }}
        >
          <h2 className="font-semibold">Orientation rules for this project</h2>
          <div>
            <label className="label">Expiry (days)</label>
            <input className="input-field w-40" type="number" min={1} placeholder="Owner standard" value={form.expiry_days} onChange={(e) => { setForm({ ...form, expiry_days: e.target.value }); setSaved(false) }} />
            <p className="mt-1 text-xs text-gray-500">Leave blank to use the owner standard. Individual modules may set a shorter period.</p>
          </div>
          <div>
            <label className="label">Open orientation this many days before a worker's start date</label>
            <input className="input-field w-40" type="number" min={0} max={90} value={form.open_days_before_start} onChange={(e) => { setForm({ ...form, open_days_before_start: e.target.value }); setSaved(false) }} required />
          </div>
          <ErrorNote error={error} />
          <button className="btn-primary">{saved ? 'Saved' : 'Save'}</button>
        </form>

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Badge & access-control integration</h2>
          <p className="text-sm text-gray-600">
            Give your badge or turnstile system a project API key. It polls live clearance status; revocations and expiries show up immediately.
          </p>
          <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{`GET ${apiBase}/api/v1/clearances?since=<ISO time>
GET ${apiBase}/api/v1/credentials/<pass code>
Authorization: Bearer <api key>`}</pre>
          {s.api_key_prefix && !key && <p className="text-xs text-gray-600">Active key: omk_{s.api_key_prefix}_••••</p>}
          {key && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
              <p className="font-semibold text-amber-900">Copy this key now — it will not be shown again.</p>
              <p className="mt-1 break-all font-mono">{key}</p>
            </div>
          )}
          <button
            className="btn-secondary"
            onClick={async () => {
              if (s.api_key_prefix && !confirm('Rotating the key disconnects any system using the old one. Continue?')) return
              try {
                const r = await staffApi.post<{ api_key: string }>(`/projects/${project.id}/api-key`)
                setKey(r.api_key)
                onChange()
              } catch (err) {
                setError(err)
              }
            }}
          >
            <KeyRound className="h-4 w-4" /> {s.api_key_prefix ? 'Rotate API key' : 'Create API key'}
          </button>
        </section>
      </div>
    </div>
  )
}
