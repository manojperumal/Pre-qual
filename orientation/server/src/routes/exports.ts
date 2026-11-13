import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import { q, one, pool } from '../lib/db.js'
import { badRequest, h, notFound } from '../lib/http.js'
import { accessibleProjects, requireProjectRole, requireStaff, staffActor } from '../lib/access.js'
import { audit } from '../lib/audit.js'
import { toCsv } from '../lib/csv.js'
import { maskPhone } from '../lib/phone.js'

/**
 * FR-25: one-click audit export for a worker, a company, or a project, over
 * an optional date range — PDF summary for legal/insurance plus CSV detail
 * including content versions, hashes and attestations.
 */

const router = Router()
router.use(requireStaff)

const querySchema = z.object({
  scope: z.enum(['project', 'company', 'worker']),
  id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(['csv', 'pdf']).default('csv'),
})

async function resolveEnrollments(req: any, p: z.infer<typeof querySchema>) {
  const staff = req.staff!
  const access = await accessibleProjects(staff)
  const roleBy = new Map(access.map((a) => [a.id, a.role]))
  let rows: any[]
  if (p.scope === 'project') {
    const role = await requireProjectRole(staff, p.id)
    rows = await q(`select id, project_id, company_id from orient_enrollments where project_id = $1`, [p.id])
    if (role === 'trade') rows = rows.filter((r) => r.company_id === staff.companyId)
  } else if (p.scope === 'company') {
    rows = await q(
      `select id, project_id, company_id from orient_enrollments where company_id = $1 and ($2::uuid is null or project_id = $2)`,
      [p.id, p.project_id ?? null]
    )
    rows = rows.filter((r) => roleBy.has(r.project_id) && (roleBy.get(r.project_id) !== 'trade' || r.company_id === staff.companyId))
  } else {
    // worker: either an enrollment id or a worker id
    rows = await q(
      `select id, project_id, company_id from orient_enrollments where id = $1 or worker_id = $1`,
      [p.id]
    )
    rows = rows.filter((r) => roleBy.has(r.project_id) && (roleBy.get(r.project_id) !== 'trade' || r.company_id === staff.companyId))
  }
  if (rows.length === 0) throw notFound('No orientation records found for this selection')
  return rows.map((r) => r.id)
}

router.get(
  '/',
  h(async (req, res) => {
    const p = querySchema.parse(req.query)
    if (p.from && p.to && p.from > p.to) throw badRequest('From date is after To date')
    const ids = await resolveEnrollments(req, p)
    const from = p.from ? `${p.from}T00:00:00Z` : null
    const to = p.to ? `${p.to}T23:59:59.999Z` : null
    const inRange = (col: string) => `($2::timestamptz is null or ${col} >= $2) and ($3::timestamptz is null or ${col} <= $3)`

    const [enrollments, completions, attempts, attestations, events] = await Promise.all([
      q(
        `select s.id, s.effective_status, s.expires_at, s.attested_at, s.identity_verified_at, s.trade, s.crew, s.start_date,
                s.revoke_kind, s.revoke_category, s.revoke_reason, s.revoked_at, s.created_at,
                w.full_name, w.phone, w.id as worker_id, p.name as project_name, p.id as project_id,
                coalesce(c.name, s.employer_name) as company_name
           from orient_enrollment_status s
           join orient_workers w on w.id = s.worker_id
           join projects p on p.id = s.project_id
           left join companies c on c.id = s.company_id
          where s.id = any($1::uuid[])
          order by p.name, coalesce(c.name, s.employer_name), w.full_name`,
        [ids]
      ),
      q(
        `select c.enrollment_id, c.completed_at, c.mode, c.language, v.id as version_id, v.version, v.content_hash, m.title, m.layer
           from orient_module_completions c join orient_module_versions v on v.id = c.module_version_id join orient_modules m on m.id = v.module_id
          where c.enrollment_id = any($1::uuid[]) and ${inRange('c.completed_at')} order by c.completed_at`,
        [ids, from, to]
      ),
      q(
        `select a.enrollment_id, a.created_at, a.check_id, a.attempt_no, a.correct, a.language, v.id as version_id, v.version, m.title
           from orient_check_attempts a join orient_module_versions v on v.id = a.module_version_id join orient_modules m on m.id = v.module_id
          where a.enrollment_id = any($1::uuid[]) and ${inRange('a.created_at')} order by a.created_at`,
        [ids, from, to]
      ),
      q(
        `select enrollment_id, id, created_at, language, signed_name, statement, manifest
           from orient_attestations where enrollment_id = any($1::uuid[]) and ${inRange('created_at')} order by created_at`,
        [ids, from, to]
      ),
      q(
        `select enrollment_id, id, created_at, actor_type, actor_label, event, payload, hash
           from orient_audit_log where enrollment_id = any($1::uuid[]) and ${inRange('created_at')} order by id`,
        [ids, from, to]
      ),
    ])

    const chainHead = await one(`select id, hash, created_at from orient_audit_log order by id desc limit 1`)
    await audit(pool, staffActor(req.staff!), 'export_generated', { projectId: p.scope === 'project' ? p.id : null }, {
      scope: p.scope,
      id: p.id,
      from: p.from ?? null,
      to: p.to ?? null,
      format: p.format,
      enrollments: ids.length,
    })

    const byE = new Map(enrollments.map((e) => [e.id, e]))
    const stamp = new Date().toISOString().slice(0, 10)
    const fileBase = `orientation-${p.scope}-${stamp}`

    if (p.format === 'csv') {
      const header = [
        'record_type', 'timestamp', 'project', 'company', 'worker', 'phone', 'worker_id', 'enrollment_id', 'trade', 'crew',
        'module', 'layer', 'content_version', 'content_version_id', 'content_hash', 'language', 'result', 'detail', 'actor', 'audit_hash',
      ]
      const rows: unknown[][] = []
      const base = (eid: string) => {
        const e = byE.get(eid)!
        return [e.project_name, e.company_name, e.full_name, maskPhone(e.phone), e.worker_id, e.id, e.trade, e.crew]
      }
      for (const e of enrollments)
        rows.push(['status', new Date().toISOString(), ...base(e.id), '', '', '', '', '', '', e.effective_status,
          `expires=${e.expires_at?.toISOString?.() ?? ''}; identity_verified=${e.identity_verified_at?.toISOString?.() ?? 'no'}${e.revoked_at ? `; ${e.revoke_kind}: ${e.revoke_category} — ${e.revoke_reason}` : ''}`, '', ''])
      for (const c of completions)
        rows.push(['completion', c.completed_at.toISOString(), ...base(c.enrollment_id), c.title, c.layer, c.version, c.version_id, c.content_hash, c.language, 'completed', `mode=${c.mode}`, 'worker', ''])
      for (const a of attempts)
        rows.push(['check_attempt', a.created_at.toISOString(), ...base(a.enrollment_id), a.title, '', a.version, a.version_id, '', a.language, a.correct ? 'correct' : 'incorrect', `check=${a.check_id}; attempt=${a.attempt_no}`, 'worker', ''])
      for (const a of attestations)
        rows.push(['attestation', a.created_at.toISOString(), ...base(a.enrollment_id), '', '', '', '', '', a.language, 'attested', `signed="${a.signed_name}"; statement="${a.statement}"; modules=${(a.manifest as any[]).map((m) => `${m.title} v${m.required_version} (${m.content_hash?.slice(0, 12)})`).join(' | ')}`, 'worker', ''])
      for (const ev of events)
        rows.push(['audit_event', ev.created_at.toISOString(), ...base(ev.enrollment_id), '', '', '', '', '', '', ev.event, JSON.stringify(ev.payload), `${ev.actor_type}:${ev.actor_label ?? ''}`, ev.hash])
      rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`)
      res.send(toCsv(header, rows))
      return
    }

    // ── PDF summary ──
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`)
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: 'Orientation audit record', Author: 'Safety Mojo' } })
    doc.pipe(res)
    doc.fontSize(18).text('Site Orientation — Audit Record', { continued: false })
    doc.moveDown(0.3).fontSize(9).fillColor('#555')
    doc.text(`Generated ${new Date().toISOString()} by ${staffActor(req.staff!).label}`)
    doc.text(`Scope: ${p.scope}${p.from || p.to ? ` · Records from ${p.from ?? 'start'} to ${p.to ?? 'today'}` : ''} · ${enrollments.length} worker record(s)`)
    if (chainHead) doc.text(`Audit chain head #${chainHead.id}: ${chainHead.hash}`)
    doc.fillColor('#000').moveDown()

    const counts: Record<string, number> = {}
    for (const e of enrollments) counts[e.effective_status] = (counts[e.effective_status] ?? 0) + 1
    doc.fontSize(11).text('Status summary', { underline: true })
    doc.fontSize(9).text(Object.entries(counts).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('   ·   ') || 'No records')
    doc.moveDown()

    for (const e of enrollments) {
      if (doc.y > 640) doc.addPage()
      doc.fontSize(11).fillColor('#000').text(`${e.full_name}  —  ${e.company_name ?? 'Unknown employer'}`)
      doc.fontSize(8.5).fillColor('#333')
      doc.text(
        `${e.project_name} · Trade: ${e.trade ?? '—'} · Crew: ${e.crew ?? '—'} · Phone ${maskPhone(e.phone)} · Worker ID ${e.worker_id}`
      )
      doc.text(
        `Status: ${e.effective_status.replace(/_/g, ' ').toUpperCase()} · Attested: ${e.attested_at ? e.attested_at.toISOString() : '—'} · Photo verified: ${e.identity_verified_at ? e.identity_verified_at.toISOString() : '—'} · Expires: ${e.expires_at ? e.expires_at.toISOString().slice(0, 10) : '—'}`
      )
      if (e.revoked_at) doc.fillColor('#b00').text(`${e.revoke_kind?.toUpperCase()} ${e.revoked_at.toISOString()} — ${e.revoke_category}: ${e.revoke_reason}`).fillColor('#333')
      const comps = completions.filter((c) => c.enrollment_id === e.id)
      for (const c of comps) {
        const tries = attempts.filter((a) => a.enrollment_id === e.id && a.version_id === c.version_id)
        const wrong = tries.filter((t) => !t.correct).length
        doc.text(
          `   [done] ${c.title} (v${c.version}, ${c.layer}${c.mode === 'delta' ? ', delta' : ''}) — ${c.completed_at.toISOString()} · ${c.language.toUpperCase()} · checks: ${tries.length} attempt(s), ${wrong} re-taught · hash ${String(c.content_hash).slice(0, 16)}…`
        )
      }
      const atts = attestations.filter((a) => a.enrollment_id === e.id)
      for (const a of atts) doc.text(`   [signed] Attested by "${a.signed_name}" ${a.created_at.toISOString()} (${a.language.toUpperCase()}): ${a.statement}`)
      doc.moveDown(0.6)
    }
    doc.moveDown().fontSize(7.5).fillColor('#777').text(
      'Records are append-only and chained with SHA-256 hashes; corrections appear as new entries. Detail including every comprehension-check attempt and audit event is available in the CSV export for the same selection.'
    )
    doc.end()
  })
)

export default router
