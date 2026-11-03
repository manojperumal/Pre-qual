import { Router, type Request } from 'express'
import { z } from 'zod'
import { config } from '../lib/config.js'
import { one, pool, q, tx } from '../lib/db.js'
import { badRequest, forbidden, h, HttpError, notFound } from '../lib/http.js'
import { normalizePhone, maskPhone } from '../lib/phone.js'
import { sendSms, smsConfigured } from '../lib/sms.js'
import { randomCode, sha256, signWorkerToken } from '../lib/tokens.js'
import { requireWorker } from '../lib/access.js'
import { audit, type Actor } from '../lib/audit.js'
import { ensureProjectSettings, projectCompanies } from '../lib/projects.js'
import { loadCurriculum, recomputeProject, requiredFor, tradesOffered } from '../lib/curriculum.js'
import { localizeForWorker, localizedTitle, partFor } from '../lib/content.js'
import { decodeDataUrl, putMedia, signedMediaUrl } from '../lib/storage.js'
import { addDays } from '../lib/status.js'
import { ATTESTATION_STATEMENT, type ModuleContent } from '../content/templates.js'

const router = Router()

const LANGS = ['en', 'es'] as const
const langSchema = z.string().min(2).max(8)
const workerActor = (id: string, name?: string | null): Actor => ({ type: 'worker', id, label: name || null })

// ─── Public project lookup (FR-1) ─────────────────────────────────────────────

router.get(
  '/projects/:code',
  h(async (req, res) => {
    const s = await one(
      `select s.*, p.name, p.address, st.languages
         from orient_project_settings s
         join projects p on p.id = s.project_id
         left join orient_standards st on st.owner_company_id = s.owner_company_id
        where upper(s.join_code) = upper($1)`,
      [req.params.code]
    )
    if (!s) throw notFound('That project code was not found. Check the code on the site poster.')
    const [companies, curriculum] = await Promise.all([projectCompanies(s.project_id), loadCurriculum(s.project_id)])
    res.json({
      project: { id: s.project_id, name: s.name, address: s.address, code: s.join_code },
      open: Boolean(s.ready_at),
      languages: s.languages ?? LANGS,
      companies,
      trades: tradesOffered(curriculum),
      open_days_before_start: s.open_days_before_start,
    })
  })
)

// ─── SMS one-time code ────────────────────────────────────────────────────────

router.post(
  '/otp/start',
  h(async (req, res) => {
    const { phone: raw, lang } = z.object({ phone: z.string(), lang: langSchema.optional() }).parse(req.body)
    const phone = normalizePhone(raw)
    if (!phone) throw badRequest('Enter a valid mobile number')

    const recent = await one(
      `select count(*)::int as n from orient_otp_codes where phone = $1 and created_at > now() - interval '1 hour'`,
      [phone]
    )
    if (recent.n >= 5) throw new HttpError(429, 'Too many codes requested. Try again in an hour.')

    const code = randomCode(6)
    await q(`insert into orient_otp_codes (phone, code_hash, expires_at) values ($1, $2, now() + interval '10 minutes')`, [
      phone,
      sha256(`${phone}:${code}`),
    ])
    const body =
      lang === 'es'
        ? `Safety Mojo: su código de verificación es ${code}. Vence en 10 minutos.`
        : `Safety Mojo: your verification code is ${code}. It expires in 10 minutes.`
    const sent = await sendSms(phone, body)
    res.json({
      sent: sent.delivered,
      phone: maskPhone(phone),
      ...(config.exposeDevOtp && !smsConfigured() ? { dev_code: code } : {}),
    })
  })
)

router.post(
  '/otp/verify',
  h(async (req, res) => {
    const { phone: raw, code } = z.object({ phone: z.string(), code: z.string().min(4).max(8) }).parse(req.body)
    const phone = normalizePhone(raw)
    if (!phone) throw badRequest('Enter a valid mobile number')

    const result = await tx(async (db) => {
      const otp = await one(
        `select * from orient_otp_codes
          where phone = $1 and used_at is null and expires_at > now()
          order by created_at desc limit 1 for update`,
        [phone],
        db
      )
      if (!otp) throw badRequest('Code expired. Request a new one.')
      if (otp.attempts >= 5) throw new HttpError(429, 'Too many attempts. Request a new code.')
      if (otp.code_hash !== sha256(`${phone}:${code.trim()}`)) {
        await q(`update orient_otp_codes set attempts = attempts + 1 where id = $1`, [otp.id], db)
        return { ok: false as const }
      }
      await q(`update orient_otp_codes set used_at = now() where id = $1`, [otp.id], db)
      const worker = await one(
        `insert into orient_workers (phone, full_name) values ($1, '')
         on conflict (phone) do update set phone = excluded.phone
         returning *`,
        [phone],
        db
      )
      await audit(db, workerActor(worker.id, worker.full_name), 'phone_verified', { workerId: worker.id }, { phone: maskPhone(phone) })
      return { ok: true as const, worker }
    })
    if (!result.ok) throw badRequest('That code is not right. Check the text message and try again.')
    res.json({ token: signWorkerToken(result.worker.id), worker: await workerView(result.worker.id) })
  })
)

// ─── Authenticated worker ─────────────────────────────────────────────────────

router.use(requireWorker)

async function workerView(workerId: string) {
  const w = await one(`select * from orient_workers where id = $1`, [workerId])
  if (!w) throw notFound('Worker not found')
  const enrollments = await q(
    `select s.id, s.project_id, p.name as project_name, s.effective_status, s.expires_at, s.credential_token,
            s.trade, s.crew, s.start_date, coalesce(c.name, s.employer_name) as employer, ps.join_code
       from orient_enrollment_status s
       join projects p on p.id = s.project_id
       left join companies c on c.id = s.company_id
       left join orient_project_settings ps on ps.project_id = s.project_id
      where s.worker_id = $1
      order by s.created_at desc`,
    [workerId]
  )
  return {
    id: w.id,
    full_name: w.full_name,
    phone: maskPhone(w.phone),
    preferred_language: w.preferred_language,
    photo_url: signedMediaUrl(w.photo_path),
    enrollments,
  }
}

router.get(
  '/me',
  h(async (req, res) => {
    res.json(await workerView(req.workerId!))
  })
)

router.patch(
  '/me',
  h(async (req, res) => {
    const body = z
      .object({ full_name: z.string().trim().min(2).max(120).optional(), preferred_language: langSchema.optional() })
      .parse(req.body)
    await q(
      `update orient_workers set full_name = coalesce($2, full_name), preferred_language = coalesce($3, preferred_language)
        where id = $1`,
      [req.workerId, body.full_name ?? null, body.preferred_language ?? null]
    )
    res.json(await workerView(req.workerId!))
  })
)

// Registration on a project (FR-1, FR-2)
router.post(
  '/enroll',
  h(async (req, res) => {
    const body = z
      .object({
        join_code: z.string().min(4).max(12),
        full_name: z.string().trim().min(2).max(120),
        company_id: z.string().uuid().nullish(),
        employer_name: z.string().trim().max(160).nullish(),
        crew: z.string().trim().max(80).nullish(),
        trade: z.string().trim().max(80).nullish(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        language: langSchema,
      })
      .parse(req.body)

    const settings = await one(`select * from orient_project_settings where upper(join_code) = upper($1)`, [body.join_code])
    if (!settings) throw notFound('Project not found')
    const projectId: string = settings.project_id
    const worker = await one(`select * from orient_workers where id = $1`, [req.workerId])
    const invite = await one(`select * from orient_invites where project_id = $1 and phone = $2`, [projectId, worker.phone])

    const companies = await projectCompanies(projectId)
    let companyId = body.company_id ?? invite?.company_id ?? null
    if (companyId && !companies.some((c) => c.id === companyId) && companyId !== invite?.company_id) {
      throw badRequest('Choose your employer from the list, or type its name')
    }
    if (!companyId && !body.employer_name) throw badRequest('Tell us who you work for')

    const enrollment = await tx(async (db) => {
      await q(
        `update orient_workers set full_name = $2, preferred_language = $3 where id = $1`,
        [req.workerId, body.full_name, body.language],
        db
      )
      const row = await one(
        `insert into orient_enrollments (worker_id, project_id, company_id, employer_name, crew, trade, start_date)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (worker_id, project_id) do update
           set company_id = excluded.company_id, employer_name = excluded.employer_name,
               crew = excluded.crew, trade = excluded.trade, start_date = excluded.start_date
         returning *, (xmax = 0) as inserted`,
        [
          req.workerId,
          projectId,
          companyId,
          companyId ? null : body.employer_name,
          body.crew ?? invite?.crew ?? null,
          body.trade ?? invite?.trade ?? null,
          body.start_date ?? invite?.start_date ?? null,
        ],
        db
      )
      if (invite) await q(`update orient_invites set enrollment_id = $2 where id = $1`, [invite.id, row.id], db)
      await audit(
        db,
        workerActor(req.workerId!, body.full_name),
        row.inserted ? 'registered' : 'registration_updated',
        { projectId, enrollmentId: row.id, workerId: req.workerId },
        { company_id: companyId, employer_name: body.employer_name ?? null, crew: row.crew, trade: row.trade, start_date: row.start_date, via_invite: Boolean(invite) }
      )
      await recomputeProject(db, projectId, [row.id])
      return row
    })
    res.json({ enrollment_id: enrollment.id })
  })
)

// Photo capture (FR-13)
router.post(
  '/photo',
  h(async (req, res) => {
    const { image } = z.object({ image: z.string().max(4_000_000) }).parse(req.body)
    let decoded
    try {
      decoded = decodeDataUrl(image, 2_500_000)
    } catch (e) {
      throw badRequest((e as Error).message)
    }
    const ext = decoded.contentType.split('/')[1]
    const path = `workers/${req.workerId}/${Date.now()}.${ext}`
    await putMedia(path, decoded.data, decoded.contentType)

    await tx(async (db) => {
      const w = await one(`select * from orient_workers where id = $1 for update`, [req.workerId], db)
      await q(`update orient_workers set photo_path = $2, photo_captured_at = now() where id = $1`, [req.workerId, path], db)
      // A new photo invalidates prior first-arrival matches — the gate must re-verify.
      const reset = await q(
        `update orient_enrollments set identity_verified_at = null, identity_verified_by = null
          where worker_id = $1 and identity_verified_at is not null returning id, project_id`,
        [req.workerId],
        db
      )
      await audit(db, workerActor(req.workerId!, w.full_name), w.photo_path ? 'photo_replaced' : 'photo_captured', { workerId: req.workerId }, { path })
      for (const e of reset) {
        await audit(db, workerActor(req.workerId!, w.full_name), 'identity_verification_reset', { projectId: e.project_id, enrollmentId: e.id, workerId: req.workerId }, { reason: 'photo_replaced' })
        await recomputeProject(db, e.project_id, [e.id])
      }
    })
    res.json({ photo_url: signedMediaUrl(path) })
  })
)

async function ownEnrollment(req: Request) {
  const e = await one(
    `select s.*, ps.ready_at, ps.open_days_before_start, ps.join_code, p.name as project_name
       from orient_enrollment_status s
       join projects p on p.id = s.project_id
       left join orient_project_settings ps on ps.project_id = s.project_id
      where s.id = $1`,
    [req.params.id]
  )
  if (!e || e.worker_id !== req.workerId) throw notFound('Enrollment not found')
  return e
}

/** FR-7: orientation opens N days before the worker's start date. */
function opensAt(e: any): Date | null {
  if (!e.start_date) return null
  const start = new Date(`${e.start_date}T00:00:00Z`)
  return addDays(start, -(e.open_days_before_start ?? 14))
}

async function planFor(req: Request) {
  const e = await ownEnrollment(req)
  const lang = (req.query.lang as string) || 'en'
  const curriculum = await loadCurriculum(e.project_id)
  const evals = await recomputeProject(pool, e.project_id, [e.id], undefined, curriculum)
  const r = evals.get(e.id)!
  const required = requiredFor(curriculum, e.trade)
  const versionIds = required.map((m) => m.currentVersionId)
  const [versions, progress, worker] = await Promise.all([
    q(`select id, content from orient_module_versions where id = any($1::uuid[])`, [versionIds]),
    q(`select module_version_id, segment_index from orient_module_progress where enrollment_id = $1`, [e.id]),
    one(`select full_name, photo_path from orient_workers where id = $1`, [req.workerId]),
  ])
  const contentBy = new Map(versions.map((v) => [v.id, v.content as ModuleContent]))
  const progressBy = new Map(progress.map((p) => [p.module_version_id, p.segment_index]))
  const open = opensAt(e)

  return {
    enrollment: {
      id: e.id,
      project_id: e.project_id,
      project_name: e.project_name,
      status: r.effectiveStatus,
      expires_at: r.expiresAt,
      attested_at: r.attestedAt,
      identity_verified: Boolean(e.identity_verified_at),
      credential_token: e.credential_token,
      revoke_category: e.revoked_at ? e.revoke_category : null,
    },
    locked: !e.ready_at
      ? { reason: 'not_ready' as const }
      : open && open > new Date()
        ? { reason: 'not_open_yet' as const, opens_at: open }
        : null,
    has_photo: Boolean(worker?.photo_path),
    worker_name: worker?.full_name,
    ready_to_attest: r.readyToAttest,
    attestation_statement: ATTESTATION_STATEMENT[(lang as 'en' | 'es')] ?? ATTESTATION_STATEMENT.en,
    modules: r.modules.map((m) => {
      const content = contentBy.get(m.current.id)!
      const mode = m.state === 'delta' ? 'delta' : 'full'
      const part = partFor(content, mode)
      return {
        module_id: m.moduleId,
        version_id: m.current.id,
        layer: m.layer,
        title: localizedTitle(content as any, m.title, lang),
        state: m.state,
        mode,
        superseded: m.superseded,
        segment_count: part.segments.length,
        check_count: part.checks.length,
        segment_index: progressBy.get(m.current.id) ?? 0,
        expires_at: m.expiresAt,
      }
    }),
  }
}

router.get(
  '/enrollments/:id/plan',
  h(async (req, res) => {
    res.json(await planFor(req))
  })
)

async function requiredVersion(req: Request, versionId: string) {
  const plan = await planFor(req)
  if (plan.locked) throw forbidden('Orientation is not open for this project yet')
  const mod = plan.modules.find((m) => m.version_id === versionId)
  if (!mod) throw notFound('This module is not part of your orientation (it may have been updated — reload)')
  return { plan, mod }
}

router.get(
  '/enrollments/:id/modules/:versionId',
  h(async (req, res) => {
    const lang = (req.query.lang as string) || 'en'
    const { mod } = await requiredVersion(req, req.params.versionId)
    const v = await one(`select content from orient_module_versions where id = $1`, [req.params.versionId])
    const since = await lastCompletionOf(req.params.id, req.params.versionId)
    const passed = await latestAttempts(req.params.id, req.params.versionId, since)
    res.json({
      ...mod,
      segment_index: since ? 0 : mod.segment_index,
      ...localizeForWorker(v.content, lang, mod.mode as 'full' | 'delta'),
      passed_checks: passed.filter((p: any) => p.correct).map((p: any) => p.check_id),
    })
  })
)

// Resume / offline sync (FR-6). Accepts a batch so queued offline events can be flushed at once.
router.post(
  '/enrollments/:id/progress',
  h(async (req, res) => {
    const e = await ownEnrollment(req)
    const { items } = z
      .object({
        items: z
          .array(z.object({ module_version_id: z.string().uuid(), segment_index: z.number().int().min(0).max(1000), language: langSchema }))
          .max(200),
      })
      .parse(req.body)
    for (const it of items) {
      await q(
        `insert into orient_module_progress (enrollment_id, module_version_id, segment_index, language)
         values ($1,$2,$3,$4)
         on conflict (enrollment_id, module_version_id) do update
           set segment_index = greatest(orient_module_progress.segment_index, excluded.segment_index),
               language = excluded.language, updated_at = now()`,
        [e.id, it.module_version_id, it.segment_index, it.language]
      )
    }
    if (e.status === 'not_started' && items.length) await recomputeProject(pool, e.project_id, [e.id])
    res.json({ ok: true })
  })
)

// Comprehension checks (FR-4): never reveals the answer; wrong → re-teach, then re-check.
router.post(
  '/enrollments/:id/checks',
  h(async (req, res) => {
    const body = z
      .object({ module_version_id: z.string().uuid(), check_id: z.string(), selected_index: z.number().int().min(0).max(5), language: langSchema })
      .parse(req.body)
    const { mod } = await requiredVersion(req, body.module_version_id)
    const v = await one(`select content from orient_module_versions where id = $1`, [body.module_version_id])
    const part = partFor(v.content, mod.mode as 'full' | 'delta')
    const check = part.checks.find((c) => c.id === body.check_id)
    if (!check) throw notFound('Unknown check')
    const correct = body.selected_index === check.correct_index

    await tx(async (db) => {
      const n = await one(
        `select count(*)::int as n from orient_check_attempts where enrollment_id = $1 and module_version_id = $2 and check_id = $3`,
        [req.params.id, body.module_version_id, body.check_id],
        db
      )
      await q(
        `insert into orient_check_attempts (enrollment_id, module_version_id, check_id, attempt_no, selected_index, correct, language)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, body.module_version_id, body.check_id, n.n + 1, body.selected_index, correct, body.language],
        db
      )
    })
    res.json({
      correct,
      reteach: correct ? null : (check.reteach[body.language] ?? check.reteach.en),
    })
  })
)

async function lastCompletionOf(enrollmentId: string, versionId: string): Promise<Date | null> {
  const r = await one(
    `select max(completed_at) as at from orient_module_completions where enrollment_id = $1 and module_version_id = $2`,
    [enrollmentId, versionId]
  )
  return r?.at ? new Date(r.at) : null
}

async function latestAttempts(enrollmentId: string, versionId: string, since: Date | null) {
  const rows = await q(
    `select distinct on (check_id) check_id, correct from orient_check_attempts
      where enrollment_id = $1 and module_version_id = $2 and ($3::timestamptz is null or created_at > $3)
      order by check_id, created_at desc`,
    [enrollmentId, versionId, since]
  )
  return rows
}

router.post(
  '/enrollments/:id/modules/:versionId/complete',
  h(async (req, res) => {
    const { language } = z.object({ language: langSchema }).parse(req.body)
    const { plan, mod } = await requiredVersion(req, req.params.versionId)
    if (mod.state === 'complete') return res.json({ ok: true, already: true })

    const v = await one(`select content from orient_module_versions where id = $1`, [req.params.versionId])
    const part = partFor(v.content, mod.mode as 'full' | 'delta')
    const since = await lastCompletionOf(req.params.id, req.params.versionId)
    const progress = await one(
      `select segment_index from orient_module_progress where enrollment_id = $1 and module_version_id = $2`,
      [req.params.id, req.params.versionId]
    )
    if ((progress?.segment_index ?? 0) < part.segments.length) throw badRequest('Finish every part of this module first')
    // On renewal (a previous completion of this same version exists) every check must be re-passed.
    const latest = await latestAttempts(req.params.id, req.params.versionId, since)
    const passed = new Set(latest.filter((l) => l.correct).map((l) => l.check_id))
    const missing = part.checks.filter((c) => !passed.has(c.id))
    if (missing.length) throw badRequest('Answer every question correctly to finish this module')

    await tx(async (db) => {
      await q(
        `insert into orient_module_completions (enrollment_id, module_version_id, mode, language) values ($1,$2,$3,$4)`,
        [req.params.id, req.params.versionId, mod.mode, language],
        db
      )
      await audit(db, workerActor(req.workerId!, plan.worker_name), 'module_completed', {
        projectId: plan.enrollment.project_id,
        enrollmentId: req.params.id,
        workerId: req.workerId,
      }, { module_id: mod.module_id, module_version_id: req.params.versionId, title: mod.title, mode: mod.mode, language })
      await recomputeProject(db, plan.enrollment.project_id, [req.params.id])
    })
    res.json({ ok: true })
  })
)

// Attestation (FR-5)
router.post(
  '/enrollments/:id/attest',
  h(async (req, res) => {
    const { signed_name, language } = z.object({ signed_name: z.string().trim().min(2).max(120), language: langSchema }).parse(req.body)
    const plan = await planFor(req)
    if (!plan.has_photo) throw badRequest('Take your photo before signing')
    if (!plan.ready_to_attest) throw badRequest('Finish every module before signing')

    const versions = await q(
      `select v.id, v.version, v.content_hash, m.id as module_id, m.title, m.layer
         from orient_module_versions v join orient_modules m on m.id = v.module_id
        where v.id = any($1::uuid[])`,
      [plan.modules.map((m) => m.version_id)]
    )
    const completions = await q(
      `select distinct on (v.module_id) v.module_id, c.module_version_id, c.completed_at, c.mode, c.language
         from orient_module_completions c join orient_module_versions v on v.id = c.module_version_id
        where c.enrollment_id = $1 order by v.module_id, v.version desc, c.completed_at desc`,
      [req.params.id]
    )
    const compBy = new Map(completions.map((c) => [c.module_id, c]))
    const manifest = versions.map((v) => ({
      module_id: v.module_id,
      title: v.title,
      layer: v.layer,
      required_version_id: v.id,
      required_version: v.version,
      content_hash: v.content_hash,
      completed_version_id: compBy.get(v.module_id)?.module_version_id ?? null,
      completed_at: compBy.get(v.module_id)?.completed_at ?? null,
      mode: compBy.get(v.module_id)?.mode ?? null,
      language: compBy.get(v.module_id)?.language ?? null,
    }))
    const statement = ATTESTATION_STATEMENT[language as 'en' | 'es'] ?? ATTESTATION_STATEMENT.en

    await tx(async (db) => {
      const att = await one(
        `insert into orient_attestations (enrollment_id, statement, language, signed_name, manifest, ip, user_agent)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [req.params.id, statement, language, signed_name, JSON.stringify(manifest), req.ip ?? null, req.get('user-agent') ?? null],
        db
      )
      await audit(db, workerActor(req.workerId!, signed_name), 'attested', {
        projectId: plan.enrollment.project_id,
        enrollmentId: req.params.id,
        workerId: req.workerId,
      }, { attestation_id: att.id, language, modules: manifest.length })
      await recomputeProject(db, plan.enrollment.project_id, [req.params.id])
    })
    res.json(await planFor(req))
  })
)

export default router
