import { Router } from 'express'
import { z } from 'zod'
import { config } from '../lib/config.js'
import { one, pool, q, tx } from '../lib/db.js'
import { badRequest, forbidden, h, notFound } from '../lib/http.js'
import {
  accessibleProjects,
  enrollmentScope,
  projectRole,
  requireProjectRole,
  requireStaff,
  staffActor,
  type ProjectRole,
  type StaffContext,
} from '../lib/access.js'
import { audit } from '../lib/audit.js'
import { ensureProjectSettings, projectCompanies, todayIso } from '../lib/projects.js'
import { loadCurriculum, projectReadiness, recomputeProject, REQUIRED_PROJECT_SECTIONS } from '../lib/curriculum.js'
import { maskPhone, normalizePhone } from '../lib/phone.js'
import { sendSms } from '../lib/sms.js'
import { signedMediaUrl } from '../lib/storage.js'
import { randomToken, sha256 } from '../lib/tokens.js'
import { PROJECT_SECTION_TEMPLATE } from '../content/templates.js'

const router = Router()
router.use(requireStaff)

const STATUSES = [
  'not_started',
  'in_progress',
  'refresh_required',
  'pending_verification',
  'cleared',
  'expired',
  'revoked',
  'suspended',
] as const

export const REVOKE_CATEGORIES = ['safety_violation', 'identity_mismatch', 'incident', 'left_project', 'other'] as const

function emptyCounts() {
  return Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>
}

router.get(
  '/me',
  h(async (req, res) => {
    res.json(req.staff)
  })
)

// ─── Projects ─────────────────────────────────────────────────────────────────

router.get(
  '/projects',
  h(async (req, res) => {
    const staff = req.staff!
    const access = await accessibleProjects(staff)
    if (access.length === 0) return res.json([])
    const ids = access.map((a) => a.id)
    const roleBy = new Map(access.map((a) => [a.id, a.role]))
    const projects = await q(
      `select p.id, p.name, p.address, p.start_date, p.end_date, oc.name as owner_company,
              s.join_code, s.ready_at
         from projects p
         left join profiles op on op.id = p.owner_id
         left join companies oc on oc.id = op.new_company_id
         left join orient_project_settings s on s.project_id = p.id
        where p.id = any($1::uuid[])
        order by p.name`,
      [ids]
    )
    const counts = await q(
      `select project_id, effective_status, count(*)::int as n
         from orient_enrollment_status
        where project_id = any($1::uuid[])
          and ($2::uuid is null or company_id = $2 or project_id = any($3::uuid[]))
        group by project_id, effective_status`,
      [ids, staff.companyType === 'trade' ? staff.companyId : null, access.filter((a) => a.role !== 'trade').map((a) => a.id)]
    )
    res.json(
      projects.map((p) => {
        const c = emptyCounts()
        for (const r of counts) if (r.project_id === p.id) c[r.effective_status as keyof typeof c] = r.n
        return { ...p, role: roleBy.get(p.id), counts: c }
      })
    )
  })
)

router.get(
  '/projects/:id',
  h(async (req, res) => {
    const role = await requireProjectRole(req.staff!, req.params.id)
    const settings = await ensureProjectSettings(req.params.id)
    const project = await one(
      `select p.id, p.name, p.address, p.start_date, p.end_date, oc.name as owner_company, oc.id as owner_company_id
         from projects p
         left join profiles op on op.id = p.owner_id
         left join companies oc on oc.id = op.new_company_id
        where p.id = $1`,
      [req.params.id]
    )
    res.json({
      ...project,
      role,
      settings: { ...settings, join_url: `${config.appUrl}/o/${settings.join_code}` },
      companies: await projectCompanies(req.params.id),
    })
  })
)

router.put(
  '/projects/:id/settings',
  h(async (req, res) => {
    await requireProjectRole(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    const body = z
      .object({
        expiry_days: z.number().int().min(1).max(3650).nullable().optional(),
        open_days_before_start: z.number().int().min(0).max(90).optional(),
      })
      .parse(req.body)
    await ensureProjectSettings(req.params.id)
    await tx(async (db) => {
      await q(
        `update orient_project_settings
            set expiry_days = case when $2::boolean then $3 else expiry_days end,
                open_days_before_start = coalesce($4, open_days_before_start)
          where project_id = $1`,
        [req.params.id, 'expiry_days' in body, body.expiry_days ?? null, body.open_days_before_start ?? null],
        db
      )
      await audit(db, staffActor(req.staff!), 'project_settings_changed', { projectId: req.params.id }, body)
      await recomputeProject(db, req.params.id, undefined, staffActor(req.staff!))
    })
    res.json(await ensureProjectSettings(req.params.id))
  })
)

router.get(
  '/projects/:id/readiness',
  h(async (req, res) => {
    await requireProjectRole(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    const settings = await ensureProjectSettings(req.params.id)
    res.json({ ...(await projectReadiness(req.params.id)), ready_at: settings.ready_at })
  })
)

router.post(
  '/projects/:id/ready',
  h(async (req, res) => {
    await requireProjectRole(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    const { ready } = z.object({ ready: z.boolean() }).parse(req.body)
    await ensureProjectSettings(req.params.id)
    if (ready) {
      const r = await projectReadiness(req.params.id)
      if (!r.ready) throw badRequest('Complete the publishing checklist first', r.items.filter((i) => !i.ok))
    }
    await tx(async (db) => {
      await q(
        `update orient_project_settings set ready_at = ${ready ? 'now()' : 'null'}, ready_by = $2 where project_id = $1`,
        [req.params.id, ready ? req.staff!.userId : null],
        db
      )
      await audit(db, staffActor(req.staff!), ready ? 'project_opened' : 'project_closed', { projectId: req.params.id })
    })
    res.json({ ok: true })
  })
)

// Create draft modules for any FR-11 sections that do not have one yet.
router.post(
  '/projects/:id/sections/scaffold',
  h(async (req, res) => {
    await requireProjectRole(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    const settings = await ensureProjectSettings(req.params.id)
    if (!settings.owner_company_id) throw badRequest('This project has no owner company')
    const existing = await q(
      `select distinct section_key from orient_modules where project_id = $1 and layer = 'project' and archived_at is null`,
      [req.params.id]
    )
    const have = new Set(existing.map((e) => e.section_key))
    const created: string[] = []
    await tx(async (db) => {
      for (const [i, s] of REQUIRED_PROJECT_SECTIONS.entries()) {
        if (have.has(s.key)) continue
        const t = PROJECT_SECTION_TEMPLATE[s.key]
        const m = await one(
          `insert into orient_modules (layer, owner_company_id, project_id, section_key, title, position, created_by)
           values ('project', $1, $2, $3, $4, $5, $6) returning id`,
          [settings.owner_company_id, req.params.id, s.key, t.title, i, req.staff!.userId],
          db
        )
        await q(
          `insert into orient_module_versions (module_id, version, content, created_by) values ($1, 1, $2, $3)`,
          [m.id, JSON.stringify(t.content), req.staff!.userId],
          db
        )
        created.push(s.key)
      }
      if (created.length)
        await audit(db, staffActor(req.staff!), 'project_sections_scaffolded', { projectId: req.params.id }, { sections: created })
    })
    res.json({ created })
  })
)

// Badge/access-system API key (FR-15). Shown once; only a hash is stored.
router.post(
  '/projects/:id/api-key',
  h(async (req, res) => {
    await requireProjectRole(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    await ensureProjectSettings(req.params.id)
    const prefix = randomToken(4)
    const secret = randomToken(24)
    const key = `omk_${prefix}_${secret}`
    await tx(async (db) => {
      await q(`update orient_project_settings set api_key_hash = $2, api_key_prefix = $3 where project_id = $1`, [
        req.params.id,
        sha256(key),
        prefix,
      ], db)
      await audit(db, staffActor(req.staff!), 'api_key_rotated', { projectId: req.params.id }, { prefix })
    })
    res.json({ api_key: key, prefix })
  })
)

// ─── Compliance view (FR-18) ──────────────────────────────────────────────────

router.get(
  '/projects/:id/compliance',
  h(async (req, res) => {
    const staff = req.staff!
    const role = await requireProjectRole(staff, req.params.id)
    const scope = enrollmentScope(role, staff, 's', 2)
    const rows = await q(
      `select s.id as enrollment_id, s.worker_id, w.full_name, w.phone, s.company_id,
              coalesce(c.name, s.employer_name) as company_name, (s.company_id is null) as employer_unlisted,
              s.crew, s.trade, s.start_date, s.effective_status, s.expires_at, s.attested_at,
              (s.identity_verified_at is not null) as identity_verified, s.revoke_category, s.created_at
         from orient_enrollment_status s
         join orient_workers w on w.id = s.worker_id
         left join companies c on c.id = s.company_id
        where s.project_id = $1${scope.sql}
        order by w.full_name`,
      [req.params.id, ...scope.params]
    )
    const today = todayIso()
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    const summary = { total: rows.length, ...emptyCounts(), expected_today_not_cleared: 0, starting_within_24h_incomplete: 0 }
    const companies = new Map<string, { id: string | null; name: string; counts: ReturnType<typeof emptyCounts>; total: number }>()
    const out = rows.map((r) => {
      const status = r.effective_status as keyof ReturnType<typeof emptyCounts>
      summary[status]++
      const expectedToday = r.start_date && r.start_date <= today
      if (expectedToday && status !== 'cleared') summary.expected_today_not_cleared++
      const dueSoon =
        r.start_date && r.start_date > today && r.start_date <= tomorrow && !['cleared', 'pending_verification'].includes(status)
      if (dueSoon) summary.starting_within_24h_incomplete++
      const key = r.company_id ?? `name:${r.company_name}`
      const co = companies.get(key) ?? { id: r.company_id, name: r.company_name ?? 'Unknown', counts: emptyCounts(), total: 0 }
      co.counts[status]++
      co.total++
      companies.set(key, co)
      return {
        ...r,
        phone: maskPhone(r.phone),
        expected_today: Boolean(expectedToday),
        flag_due_soon: Boolean(dueSoon),
      }
    })
    res.json({ role, summary, companies: [...companies.values()].sort((a, b) => a.name.localeCompare(b.name)), rows: out })
  })
)

// ─── Enrollment detail, identity, revocation (FR-13, FR-16) ───────────────────

async function loadEnrollmentForStaff(staff: StaffContext, enrollmentId: string, allowed?: ProjectRole[]) {
  const e = await one(`select * from orient_enrollment_status where id = $1`, [enrollmentId])
  if (!e) throw notFound('Worker record not found')
  const role = await requireProjectRole(staff, e.project_id, allowed)
  if (role === 'trade' && e.company_id !== staff.companyId) throw notFound('Worker record not found')
  return { e, role }
}

export async function gateCard(enrollmentId: string, role: ProjectRole | null) {
  const r = await one(
    `select s.id, s.project_id, p.name as project_name, s.effective_status, s.expires_at, s.trade, s.crew,
            s.start_date, (s.identity_verified_at is not null) as identity_verified, s.identity_verified_at,
            s.revoke_kind, s.revoke_category, s.credential_token,
            w.id as worker_id, w.full_name, w.photo_path, coalesce(c.name, s.employer_name) as company_name
       from orient_enrollment_status s
       join orient_workers w on w.id = s.worker_id
       join projects p on p.id = s.project_id
       left join companies c on c.id = s.company_id
      where s.id = $1`,
    [enrollmentId]
  )
  if (!r) return null
  const { photo_path, ...rest } = r
  return {
    ...rest,
    photo_url: signedMediaUrl(photo_path, 10 * 60),
    revoke_category: role ? r.revoke_category : null,
    checked_at: new Date().toISOString(),
  }
}

router.get(
  '/enrollments/:id',
  h(async (req, res) => {
    const { e, role } = await loadEnrollmentForStaff(req.staff!, req.params.id)
    const evals = await recomputeProject(pool, e.project_id, [e.id])
    const r = evals.get(e.id)!
    const [card, attempts, completions, attestations, auditRows] = await Promise.all([
      gateCard(e.id, role),
      q(
        `select a.check_id, a.attempt_no, a.correct, a.language, a.created_at, m.title, v.version
           from orient_check_attempts a
           join orient_module_versions v on v.id = a.module_version_id
           join orient_modules m on m.id = v.module_id
          where a.enrollment_id = $1 order by a.created_at`,
        [e.id]
      ),
      q(
        `select c.completed_at, c.mode, c.language, v.id as version_id, v.version, v.content_hash, m.title, m.layer
           from orient_module_completions c
           join orient_module_versions v on v.id = c.module_version_id
           join orient_modules m on m.id = v.module_id
          where c.enrollment_id = $1 order by c.completed_at`,
        [e.id]
      ),
      q(`select id, statement, language, signed_name, manifest, created_at from orient_attestations where enrollment_id = $1 order by created_at`, [e.id]),
      q(
        `select id, created_at, actor_type, actor_label, event, payload, hash
           from orient_audit_log where enrollment_id = $1 or (worker_id = $2 and enrollment_id is null)
          order by id`,
        [e.id, e.worker_id]
      ),
    ])
    res.json({
      role,
      card: { ...card, effective_status: r.effectiveStatus, expires_at: r.expiresAt },
      revoke_reason: role === 'trade' ? null : e.revoke_reason,
      modules: r.modules,
      ready_to_attest: r.readyToAttest,
      attempts,
      completions,
      attestations,
      audit: auditRows,
    })
  })
)

router.post(
  '/enrollments/:id/verify-identity',
  h(async (req, res) => {
    const { match, note } = z.object({ match: z.boolean(), note: z.string().max(500).optional() }).parse(req.body)
    const { e } = await loadEnrollmentForStaff(req.staff!, req.params.id)
    const w = await one(`select photo_path from orient_workers where id = $1`, [e.worker_id])
    if (!w?.photo_path) throw badRequest('This worker has no photo on file yet')
    await tx(async (db) => {
      if (match) {
        await q(`update orient_enrollments set identity_verified_at = now(), identity_verified_by = $2 where id = $1`, [
          e.id,
          req.staff!.userId,
        ], db)
      }
      await audit(db, staffActor(req.staff!), match ? 'identity_verified' : 'identity_mismatch', {
        projectId: e.project_id,
        enrollmentId: e.id,
        workerId: e.worker_id,
      }, { note: note ?? null })
      await recomputeProject(db, e.project_id, [e.id], staffActor(req.staff!))
    })
    res.json(await gateCard(e.id, 'gc'))
  })
)

router.post(
  '/enrollments/:id/revoke',
  h(async (req, res) => {
    const { e } = await loadEnrollmentForStaff(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    const body = z
      .object({
        kind: z.enum(['revoked', 'suspended']),
        category: z.enum(REVOKE_CATEGORIES),
        reason: z.string().trim().min(3, 'A reason is required').max(1000),
      })
      .parse(req.body)
    await tx(async (db) => {
      await q(
        `update orient_enrollments set revoked_at = now(), revoke_kind = $2, revoke_category = $3, revoke_reason = $4, revoked_by = $5
          where id = $1`,
        [e.id, body.kind, body.category, body.reason, req.staff!.userId],
        db
      )
      await audit(db, staffActor(req.staff!), body.kind === 'revoked' ? 'clearance_revoked' : 'clearance_suspended', {
        projectId: e.project_id,
        enrollmentId: e.id,
        workerId: e.worker_id,
      }, body)
    })
    res.json(await gateCard(e.id, 'gc'))
  })
)

router.post(
  '/enrollments/:id/reinstate',
  h(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body)
    const { e } = await loadEnrollmentForStaff(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    if (!e.revoked_at) throw badRequest('This clearance is not revoked or suspended')
    await tx(async (db) => {
      await q(
        `update orient_enrollments set revoked_at = null, revoke_kind = null, revoke_category = null, revoke_reason = null, revoked_by = null
          where id = $1`,
        [e.id],
        db
      )
      await audit(db, staffActor(req.staff!), 'clearance_reinstated', { projectId: e.project_id, enrollmentId: e.id, workerId: e.worker_id }, {
        reason,
        previous: { kind: e.revoke_kind, category: e.revoke_category, reason: e.revoke_reason },
      })
    })
    res.json(await gateCard(e.id, 'gc'))
  })
)

// ─── Gate verification view (FR-13, FR-15) ────────────────────────────────────

router.get(
  '/gate/lookup',
  h(async (req, res) => {
    const staff = req.staff!
    const raw = String(req.query.token || '').trim()
    // Accept a bare token or a scanned credential URL (…/v/<token>)
    const token = raw.split('/v/').pop()!.split(/[?#]/)[0]
    if (!/^[a-f0-9]{16,64}$/.test(token)) throw badRequest('Not a Safety Mojo credential')
    const e = await one(`select id, project_id, company_id from orient_enrollments where credential_token = $1`, [token])
    if (!e) throw notFound('Credential not recognized')
    const role = await projectRole(staff, e.project_id)
    if (!role || (role === 'trade' && e.company_id !== staff.companyId)) throw forbidden('This credential is for a project you do not manage')
    const projectId = String(req.query.project_id || '')
    const card = await gateCard(e.id, role)
    await audit(pool, staffActor(staff), 'credential_scanned', { projectId: e.project_id, enrollmentId: e.id }, {
      result: card!.effective_status,
      at_gate_of: projectId || null,
    })
    res.json({ ...card, wrong_project: Boolean(projectId && projectId !== e.project_id) })
  })
)

router.get(
  '/projects/:id/gate/search',
  h(async (req, res) => {
    const staff = req.staff!
    const role = await requireProjectRole(staff, req.params.id)
    const term = String(req.query.q || '').trim()
    if (term.length < 2) return res.json([])
    const scope = enrollmentScope(role, staff, 's', 4)
    const last4 = term.replace(/\D/g, '').slice(-4)
    const rows = await q(
      `select s.id from orient_enrollment_status s join orient_workers w on w.id = s.worker_id
        where s.project_id = $1 and (w.full_name ilike $2 or ($3 <> '' and right(w.phone, 4) = $3))${scope.sql}
        order by w.full_name limit 10`,
      [req.params.id, `%${term}%`, last4.length === 4 ? last4 : '', ...scope.params]
    )
    res.json(await Promise.all(rows.map((r) => gateCard(r.id, role))))
  })
)

// ─── Owner portfolio (FR-19) ──────────────────────────────────────────────────

router.get(
  '/portfolio',
  h(async (req, res) => {
    const staff = req.staff!
    const access = (await accessibleProjects(staff)).filter((a) => a.role === 'owner' || a.role === 'mojo')
    if (access.length === 0) return res.json({ totals: { total: 0, ...emptyCounts(), expected_today_not_cleared: 0 }, projects: [] })
    const ids = access.map((a) => a.id)
    const today = todayIso()
    const [projects, gcs, rows] = await Promise.all([
      q(`select p.id, p.name, p.address, s.ready_at from projects p left join orient_project_settings s on s.project_id = p.id where p.id = any($1::uuid[]) order by p.name`, [ids]),
      q(
        `select distinct pm.project_id, c.id, c.name
           from project_members pm join profiles pr on pr.id = pm.user_id join companies c on c.id = pr.new_company_id
          where pm.project_id = any($1::uuid[]) and pm.role = 'gc'`,
        [ids]
      ),
      q(
        `select s.project_id, s.company_id, coalesce(c.name, s.employer_name, 'Unknown') as company_name,
                s.effective_status, count(*)::int as n,
                count(*) filter (where s.start_date <= $2 and s.effective_status <> 'cleared')::int as uncleared_today
           from orient_enrollment_status s left join companies c on c.id = s.company_id
          where s.project_id = any($1::uuid[])
          group by s.project_id, s.company_id, coalesce(c.name, s.employer_name, 'Unknown'), s.effective_status`,
        [ids, today]
      ),
    ])
    const totals = { total: 0, ...emptyCounts(), expected_today_not_cleared: 0 }
    const out = projects.map((p) => {
      const counts = { total: 0, ...emptyCounts(), expected_today_not_cleared: 0 }
      const companies = new Map<string, any>()
      for (const r of rows.filter((r) => r.project_id === p.id)) {
        const st = r.effective_status as keyof ReturnType<typeof emptyCounts>
        counts[st] += r.n
        counts.total += r.n
        counts.expected_today_not_cleared += r.uncleared_today
        const key = r.company_id ?? r.company_name
        const co = companies.get(key) ?? { id: r.company_id, name: r.company_name, total: 0, ...emptyCounts(), expected_today_not_cleared: 0 }
        co[st] += r.n
        co.total += r.n
        co.expected_today_not_cleared += r.uncleared_today
        companies.set(key, co)
      }
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += counts[k]
      return {
        ...p,
        counts,
        gcs: gcs.filter((g) => g.project_id === p.id).map((g) => ({ id: g.id, name: g.name })),
        companies: [...companies.values()].sort((a, b) => b.expected_today_not_cleared - a.expected_today_not_cleared || a.name.localeCompare(b.name)),
      }
    })
    res.json({ totals, projects: out })
  })
)

// ─── Subcontractor roster and bulk invite (FR-20) ─────────────────────────────

router.get(
  '/projects/:id/roster',
  h(async (req, res) => {
    const staff = req.staff!
    const role = await requireProjectRole(staff, req.params.id)
    const companyId = role === 'trade' ? staff.companyId : (req.query.company_id as string) || null
    if (!companyId) throw badRequest('Choose a company')
    const evals = await recomputeProject(
      pool,
      req.params.id,
      (await q(`select id from orient_enrollments where project_id = $1 and company_id = $2`, [req.params.id, companyId])).map((r) => r.id)
    )
    const [enrollments, invites, company] = await Promise.all([
      q(
        `select s.id, s.worker_id, w.full_name, w.phone, s.crew, s.trade, s.start_date, s.effective_status, s.expires_at
           from orient_enrollment_status s join orient_workers w on w.id = s.worker_id
          where s.project_id = $1 and s.company_id = $2 order by w.full_name`,
        [req.params.id, companyId]
      ),
      q(
        `select * from orient_invites where project_id = $1 and company_id = $2 and enrollment_id is null order by created_at desc`,
        [req.params.id, companyId]
      ),
      one(`select id, name from companies where id = $1`, [companyId]),
    ])
    res.json({
      company,
      workers: enrollments.map((e) => {
        const r = evals.get(e.id)
        return {
          ...e,
          phone: maskPhone(e.phone),
          remaining: r ? r.modules.filter((m) => m.state !== 'complete').map((m) => m.title) : [],
          needs_attestation: r?.readyToAttest ?? false,
          needs_photo_match: e.effective_status === 'pending_verification',
        }
      }),
      invited: invites.map((i) => ({ ...i, phone: maskPhone(i.phone) })),
    })
  })
)

router.post(
  '/projects/:id/invites',
  h(async (req, res) => {
    const staff = req.staff!
    const role = await requireProjectRole(staff, req.params.id)
    const body = z
      .object({
        company_id: z.string().uuid().optional(),
        send_sms: z.boolean().default(true),
        entries: z
          .array(
            z.object({
              phone: z.string().min(1).max(40),
              full_name: z.string().trim().max(120).optional(),
              crew: z.string().trim().max(80).optional(),
              trade: z.string().trim().max(80).optional(),
              start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
            })
          )
          .min(1)
          .max(500),
      })
      .parse(req.body)
    const companyId = role === 'trade' ? staff.companyId : body.company_id
    if (!companyId) throw badRequest('Choose which company these workers belong to')
    const settings = await ensureProjectSettings(req.params.id)
    const project = await one(`select name from projects where id = $1`, [req.params.id])
    const link = `${config.appUrl}/o/${settings.join_code}`

    const results: { phone: string; ok: boolean; error?: string }[] = []
    const toSend: { phone: string; name?: string }[] = []
    await tx(async (db) => {
      for (const entry of body.entries) {
        const phone = normalizePhone(entry.phone)
        if (!phone) {
          results.push({ phone: entry.phone, ok: false, error: 'Invalid phone number' })
          continue
        }
        await q(
          `insert into orient_invites (project_id, company_id, phone, full_name, crew, trade, start_date, invited_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (project_id, phone) do update
             set company_id = excluded.company_id, full_name = coalesce(excluded.full_name, orient_invites.full_name),
                 crew = coalesce(excluded.crew, orient_invites.crew), trade = coalesce(excluded.trade, orient_invites.trade),
                 start_date = coalesce(excluded.start_date, orient_invites.start_date), invited_by = excluded.invited_by`,
          [req.params.id, companyId, phone, entry.full_name || null, entry.crew || null, entry.trade || null, entry.start_date || null, staff.userId],
          db
        )
        results.push({ phone: maskPhone(phone), ok: true })
        toSend.push({ phone, name: entry.full_name })
      }
      await audit(db, staffActor(staff), 'crew_invited', { projectId: req.params.id }, {
        company_id: companyId,
        count: toSend.length,
        rejected: results.filter((r) => !r.ok).length,
      })
    })

    let delivered = 0
    if (body.send_sms) {
      for (const t of toSend) {
        const greeting = t.name ? `Hi ${t.name.split(' ')[0]}, ` : ''
        const r = await sendSms(
          t.phone,
          `${greeting}complete your site orientation for ${project.name} before your first shift: ${link} (Español disponible)`
        )
        if (r.delivered) delivered++
        await q(`update orient_invites set sent_at = now() where project_id = $1 and phone = $2`, [req.params.id, t.phone])
      }
    }
    res.json({ invited: toSend.length, delivered, link, results })
  })
)

// ─── Audit trail per project ─────────────────────────────────────────────────

router.get(
  '/projects/:id/audit',
  h(async (req, res) => {
    await requireProjectRole(req.staff!, req.params.id, ['owner', 'gc', 'mojo'])
    const rows = await q(
      `select a.id, a.created_at, a.actor_type, a.actor_label, a.event, a.payload, a.enrollment_id, w.full_name as worker_name, a.hash
         from orient_audit_log a left join orient_workers w on w.id = a.worker_id
        where a.project_id = $1 order by a.id desc limit 500`,
      [req.params.id]
    )
    res.json(rows)
  })
)

export default router
