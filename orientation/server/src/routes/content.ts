import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { one, q, tx } from '../lib/db.js'
import { badRequest, forbidden, h, notFound } from '../lib/http.js'
import { requireProjectRole, requireStaff, staffActor, type StaffContext } from '../lib/access.js'
import { audit } from '../lib/audit.js'
import { contentHash, contentSchema, publishProblems } from '../lib/content.js'
import { projectsUsingModule, recomputeProject, REQUIRED_PROJECT_SECTIONS } from '../lib/curriculum.js'
import { ensureProjectSettings } from '../lib/projects.js'
import { decodeDataUrl, putMedia, signedMediaUrl } from '../lib/storage.js'
import { BASELINE_TEMPLATE } from '../content/templates.js'

const router = Router()
router.use(requireStaff)

const DEFAULT_STANDARD = { name: 'Site Orientation Standard', expiry_days: 365, reminder_days: [30, 7, 1], languages: ['en', 'es'], retention_years: 10 }

/** The owner company a staff user administers the standard for. */
function ownerCompanyFor(staff: StaffContext, requested?: string): string {
  if (staff.isMojoAdmin && requested) return requested
  if (staff.companyType !== 'owner' || !staff.companyId) throw forbidden('Only the project owner manages the orientation standard')
  if (requested && requested !== staff.companyId) throw forbidden('Not your organization')
  return staff.companyId
}

/**
 * FR-9: the owner controls the baseline (and owner-wide trade modules); the GC
 * controls the project layer and may only ADD. There is no code path for a GC
 * to edit, archive or replace an owner-level module.
 */
async function assertCanEditModule(staff: StaffContext, mod: { layer: string; owner_company_id: string; project_id: string | null }) {
  if (staff.isMojoAdmin) return
  if (mod.project_id) {
    await requireProjectRole(staff, mod.project_id, ['owner', 'gc', 'mojo'])
    return
  }
  if (!(staff.companyType === 'owner' && staff.companyId === mod.owner_company_id)) {
    throw forbidden('Owner baseline content can only be changed by the owner')
  }
  if (!staff.isCompanyAdmin) throw forbidden('Only owner admins can change the orientation standard')
}

async function assertCanViewModule(staff: StaffContext, mod: { owner_company_id: string; project_id: string | null }) {
  if (staff.isMojoAdmin) return
  if (mod.project_id) {
    await requireProjectRole(staff, mod.project_id)
    return
  }
  if (staff.companyId === mod.owner_company_id) return
  // GCs/trades on any of the owner's projects may read baseline content.
  const ok = await one(
    `select 1 from projects p join profiles op on op.id = p.owner_id
       join project_members pm on pm.project_id = p.id join profiles mp on mp.id = pm.user_id
      where op.new_company_id = $1 and (pm.user_id = $2 or mp.new_company_id = $3) limit 1`,
    [mod.owner_company_id, staff.userId, staff.companyId]
  )
  if (!ok) throw notFound('Module not found')
}

async function standardFor(ownerCompanyId: string) {
  const s = await one(`select * from orient_standards where owner_company_id = $1`, [ownerCompanyId])
  return s ?? { ...DEFAULT_STANDARD, owner_company_id: ownerCompanyId, id: null }
}

const moduleSummarySql = `
  select m.*,
         (select json_build_object('id', v.id, 'version', v.version, 'published_at', v.published_at, 'change_policy', v.change_policy)
            from orient_module_versions v where v.module_id = m.id and v.status = 'published' order by v.version desc limit 1) as published,
         (select json_build_object('id', v.id, 'version', v.version, 'created_at', v.created_at)
            from orient_module_versions v where v.module_id = m.id and v.status = 'draft' order by v.version desc limit 1) as draft
    from orient_modules m`

// ─── Owner standard ───────────────────────────────────────────────────────────

router.get(
  '/standard',
  h(async (req, res) => {
    const ownerCompanyId = ownerCompanyFor(req.staff!, req.query.owner_company_id as string | undefined)
    const [standard, modules, company] = await Promise.all([
      standardFor(ownerCompanyId),
      q(`${moduleSummarySql} where m.owner_company_id = $1 and m.project_id is null and m.archived_at is null order by m.layer, m.trade nulls first, m.position, m.title`, [ownerCompanyId]),
      one(`select id, name from companies where id = $1`, [ownerCompanyId]),
    ])
    res.json({ company, standard, modules, can_edit: req.staff!.isMojoAdmin || req.staff!.isCompanyAdmin })
  })
)

router.put(
  '/standard',
  h(async (req, res) => {
    const staff = req.staff!
    const body = z
      .object({
        owner_company_id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(160),
        expiry_days: z.number().int().min(1).max(3650),
        reminder_days: z.array(z.number().int().min(0).max(365)).max(6),
        languages: z.array(z.string().min(2).max(8)).min(1).max(10),
        retention_years: z.number().int().min(1).max(50),
      })
      .parse(req.body)
    const ownerCompanyId = ownerCompanyFor(staff, body.owner_company_id)
    if (!staff.isMojoAdmin && !staff.isCompanyAdmin) throw forbidden('Only owner admins can change the standard')
    if (!body.languages.includes('en')) throw badRequest('English is required (source language)')
    const row = await tx(async (db) => {
      const r = await one(
        `insert into orient_standards (owner_company_id, name, expiry_days, reminder_days, languages, retention_years)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (owner_company_id) do update
           set name = excluded.name, expiry_days = excluded.expiry_days, reminder_days = excluded.reminder_days,
               languages = excluded.languages, retention_years = excluded.retention_years
         returning *`,
        [ownerCompanyId, body.name, body.expiry_days, [...new Set(body.reminder_days)].sort((a, b) => b - a), body.languages, body.retention_years],
        db
      )
      await audit(db, staffActor(staff), 'standard_changed', {}, { owner_company_id: ownerCompanyId, ...body })
      return r
    })
    // Expiry may have changed for every project in the portfolio.
    const projects = await q(
      `select distinct e.project_id from orient_enrollments e join projects p on p.id = e.project_id
         join profiles op on op.id = p.owner_id where op.new_company_id = $1`,
      [ownerCompanyId]
    )
    for (const p of projects) await tx((db) => recomputeProject(db, p.project_id, undefined, staffActor(staff)))
    res.json(row)
  })
)

router.post(
  '/standard/clone-template',
  h(async (req, res) => {
    const staff = req.staff!
    const ownerCompanyId = ownerCompanyFor(staff, req.body?.owner_company_id)
    if (!staff.isMojoAdmin && !staff.isCompanyAdmin) throw forbidden('Only owner admins can change the standard')
    const created = await tx(async (db) => {
      const existing = await one(`select count(*)::int as n from orient_modules where owner_company_id = $1 and layer = 'baseline' and archived_at is null`, [ownerCompanyId], db)
      if (existing.n > 0) throw badRequest('This standard already has baseline modules')
      await q(`insert into orient_standards (owner_company_id) values ($1) on conflict do nothing`, [ownerCompanyId], db)
      const ids: string[] = []
      for (const [i, t] of BASELINE_TEMPLATE.entries()) {
        const m = await one(
          `insert into orient_modules (layer, owner_company_id, title, position, created_by) values ('baseline', $1, $2, $3, $4) returning id`,
          [ownerCompanyId, t.title, i, staff.userId],
          db
        )
        await q(`insert into orient_module_versions (module_id, version, content, created_by) values ($1, 1, $2, $3)`, [m.id, JSON.stringify(t.content), staff.userId], db)
        ids.push(m.id)
      }
      await audit(db, staffActor(staff), 'baseline_template_cloned', {}, { owner_company_id: ownerCompanyId, modules: ids.length })
      return ids
    })
    res.json({ created: created.length })
  })
)

// ─── Project content (project layer + project trade modules) ──────────────────

router.get(
  '/projects/:id/modules',
  h(async (req, res) => {
    const role = await requireProjectRole(req.staff!, req.params.id)
    const settings = await ensureProjectSettings(req.params.id)
    const [projectModules, ownerModules] = await Promise.all([
      q(`${moduleSummarySql} where m.project_id = $1 and m.archived_at is null order by m.layer, m.position, m.title`, [req.params.id]),
      settings.owner_company_id
        ? q(`${moduleSummarySql} where m.owner_company_id = $1 and m.project_id is null and m.archived_at is null order by m.layer, m.trade nulls first, m.position`, [settings.owner_company_id])
        : Promise.resolve([]),
    ])
    res.json({
      role,
      can_edit: ['owner', 'gc', 'mojo'].includes(role),
      sections: REQUIRED_PROJECT_SECTIONS,
      project_modules: projectModules,
      owner_modules: ownerModules,
    })
  })
)

// ─── Modules ──────────────────────────────────────────────────────────────────

router.post(
  '/modules',
  h(async (req, res) => {
    const staff = req.staff!
    const body = z
      .object({
        layer: z.enum(['baseline', 'project', 'trade']),
        project_id: z.string().uuid().nullish(),
        owner_company_id: z.string().uuid().optional(),
        trade: z.string().trim().min(2).max(80).nullish(),
        section_key: z.string().max(40).nullish(),
        title: z.string().trim().min(2).max(160),
        expiry_days: z.number().int().min(1).max(3650).nullish(),
      })
      .parse(req.body)

    let ownerCompanyId: string
    if (body.project_id) {
      if (body.layer === 'baseline') throw badRequest('Baseline modules belong to the owner standard, not a project')
      await requireProjectRole(staff, body.project_id, ['owner', 'gc', 'mojo'])
      const s = await ensureProjectSettings(body.project_id)
      if (!s.owner_company_id) throw badRequest('This project has no owner company')
      ownerCompanyId = s.owner_company_id
    } else {
      if (body.layer === 'project') throw badRequest('Project modules need a project')
      ownerCompanyId = ownerCompanyFor(staff, body.owner_company_id)
      if (!staff.isMojoAdmin && !staff.isCompanyAdmin) throw forbidden('Only owner admins can change the standard')
    }
    if (body.layer === 'trade' && !body.trade) throw badRequest('Name the trade this module applies to')
    if (body.section_key && !REQUIRED_PROJECT_SECTIONS.some((s) => s.key === body.section_key)) throw badRequest('Unknown section')

    const created = await tx(async (db) => {
      const pos = await one(
        `select coalesce(max(position), -1) + 1 as p from orient_modules where owner_company_id = $1 and layer = $2 and project_id is not distinct from $3`,
        [ownerCompanyId, body.layer, body.project_id ?? null],
        db
      )
      const m = await one(
        `insert into orient_modules (layer, owner_company_id, project_id, trade, section_key, title, position, expiry_days, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [body.layer, ownerCompanyId, body.project_id ?? null, body.layer === 'trade' ? body.trade : null, body.layer === 'project' ? body.section_key ?? null : null, body.title, pos.p, body.expiry_days ?? null, staff.userId],
        db
      )
      await q(`insert into orient_module_versions (module_id, version, content, created_by) values ($1, 1, $2, $3)`, [
        m.id,
        JSON.stringify({ segments: [{ id: 's1', text: { en: '', es: '' } }], checks: [] }),
        staff.userId,
      ], db)
      await audit(db, staffActor(staff), 'module_created', { projectId: body.project_id ?? null }, { module_id: m.id, layer: m.layer, title: m.title, trade: m.trade })
      return m
    })
    res.json(created)
  })
)

router.get(
  '/modules/:id',
  h(async (req, res) => {
    const m = await one(`select * from orient_modules where id = $1`, [req.params.id])
    if (!m) throw notFound('Module not found')
    await assertCanViewModule(req.staff!, m)
    let canEdit = true
    try {
      await assertCanEditModule(req.staff!, m)
    } catch {
      canEdit = false
    }
    const versions = await q(
      `select v.id, v.version, v.status, v.change_policy, v.translations_reviewed, v.content_hash, v.created_at, v.published_at,
              pp.full_name as published_by_name
         from orient_module_versions v left join profiles pp on pp.id = v.published_by
        where v.module_id = $1 order by v.version desc`,
      [m.id]
    )
    const standard = await standardFor(m.owner_company_id)
    res.json({ module: m, versions, can_edit: canEdit, languages: standard.languages })
  })
)

router.put(
  '/modules/:id',
  h(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(2).max(160).optional(),
        position: z.number().int().min(0).max(1000).optional(),
        expiry_days: z.number().int().min(1).max(3650).nullable().optional(),
        trade: z.string().trim().min(2).max(80).optional(),
      })
      .parse(req.body)
    const m = await one(`select * from orient_modules where id = $1`, [req.params.id])
    if (!m) throw notFound('Module not found')
    await assertCanEditModule(req.staff!, m)
    const row = await tx(async (db) => {
      const r = await one(
        `update orient_modules set title = coalesce($2, title), position = coalesce($3, position),
                expiry_days = case when $4::boolean then $5 else expiry_days end,
                trade = case when layer = 'trade' then coalesce($6, trade) else trade end
          where id = $1 returning *`,
        [m.id, body.title ?? null, body.position ?? null, 'expiry_days' in body, body.expiry_days ?? null, body.trade ?? null],
        db
      )
      await audit(db, staffActor(req.staff!), 'module_updated', { projectId: m.project_id }, { module_id: m.id, ...body })
      return r
    })
    for (const p of await projectsUsingModule(m.id)) await tx((db) => recomputeProject(db, p, undefined, staffActor(req.staff!)))
    res.json(row)
  })
)

router.post(
  '/modules/:id/archive',
  h(async (req, res) => {
    const m = await one(`select * from orient_modules where id = $1`, [req.params.id])
    if (!m) throw notFound('Module not found')
    await assertCanEditModule(req.staff!, m)
    const projects = await projectsUsingModule(m.id)
    await tx(async (db) => {
      await q(`update orient_modules set archived_at = now() where id = $1`, [m.id], db)
      await audit(db, staffActor(req.staff!), 'module_archived', { projectId: m.project_id }, { module_id: m.id, title: m.title, layer: m.layer })
      for (const p of projects) await recomputeProject(db, p, undefined, staffActor(req.staff!))
    })
    res.json({ ok: true })
  })
)

/** Start a new draft from the latest version (or return the existing draft). */
router.post(
  '/modules/:id/draft',
  h(async (req, res) => {
    const m = await one(`select * from orient_modules where id = $1`, [req.params.id])
    if (!m) throw notFound('Module not found')
    await assertCanEditModule(req.staff!, m)
    const draft = await tx(async (db) => {
      const existing = await one(`select id from orient_module_versions where module_id = $1 and status = 'draft'`, [m.id], db)
      if (existing) return existing
      const latest = await one(`select * from orient_module_versions where module_id = $1 order by version desc limit 1`, [m.id], db)
      const { delta: _drop, ...base } = latest.content
      return one(
        `insert into orient_module_versions (module_id, version, content, change_policy, created_by)
         values ($1, $2, $3, 'full', $4) returning id`,
        [m.id, latest.version + 1, JSON.stringify(base), req.staff!.userId],
        db
      )
    })
    res.json(draft)
  })
)

// ─── Versions ─────────────────────────────────────────────────────────────────

/** All learner-facing text of one language, for change detection. */
function langText(content: any, lang: string): string {
  const parts: unknown[] = []
  const walk = (p: any) => {
    if (!p) return
    for (const s of p.segments ?? []) parts.push(s.text?.[lang], s.image_path ?? null)
    for (const c of p.checks ?? []) parts.push(c.prompt?.[lang], c.options?.[lang], c.reteach?.[lang], c.correct_index)
  }
  parts.push(content?.title?.[lang])
  walk(content)
  walk(content?.delta)
  return JSON.stringify(parts)
}

async function loadVersion(staff: StaffContext, id: string, edit = false) {
  const v = await one(
    `select v.*, m.layer, m.owner_company_id, m.project_id, m.title as module_title
       from orient_module_versions v join orient_modules m on m.id = v.module_id where v.id = $1`,
    [id]
  )
  if (!v) throw notFound('Version not found')
  if (edit) await assertCanEditModule(staff, v)
  else await assertCanViewModule(staff, v)
  return v
}

// FR-10: an auditor can retrieve exactly what a worker completed.
router.get(
  '/versions/:id',
  h(async (req, res) => {
    const v = await loadVersion(req.staff!, req.params.id)
    const standard = await standardFor(v.owner_company_id)
    const withUrls = (segs: any[] = []) => segs.map((s) => ({ ...s, image_url: signedMediaUrl(s.image_path, 60 * 60) }))
    res.json({
      ...v,
      content: {
        ...v.content,
        segments: withUrls(v.content.segments),
        delta: v.content.delta ? { ...v.content.delta, segments: withUrls(v.content.delta.segments) } : undefined,
      },
      languages: standard.languages,
      problems:
        v.status === 'draft'
          ? publishProblems(v.content, {
              languages: standard.languages,
              translationsReviewed: v.translations_reviewed,
              changePolicy: v.change_policy,
              version: v.version,
            })
          : [],
    })
  })
)

router.put(
  '/versions/:id',
  h(async (req, res) => {
    const body = z
      .object({
        content: contentSchema,
        change_policy: z.enum(['full', 'delta', 'new_only']).optional(),
        translations_reviewed: z.record(z.string(), z.object({ by: z.string().min(2).max(120), at: z.string() }).nullable()).optional(),
      })
      .parse(req.body)
    const v = await loadVersion(req.staff!, req.params.id, true)
    if (v.status !== 'draft') throw badRequest('Published versions cannot be changed — start a new draft')
    // A translation sign-off only covers the text that was reviewed: if any text in that
    // language (or the English source) changes, the sign-off is dropped.
    const reviewed: Record<string, unknown> = Object.fromEntries(
      Object.entries(body.translations_reviewed ?? {}).filter(([, val]) => val)
    )
    const enChanged = langText(v.content, 'en') !== langText(body.content, 'en')
    for (const lang of Object.keys(reviewed)) {
      const wasReviewed = Boolean(v.translations_reviewed?.[lang])
      const textChanged = langText(v.content, lang) !== langText(body.content, lang)
      if (wasReviewed && (textChanged || enChanged)) delete reviewed[lang]
    }
    const stripUrls = (segs: any[]) => segs.map(({ image_url: _u, ...s }) => s)
    const content = {
      ...body.content,
      segments: stripUrls(body.content.segments),
      delta: body.content.delta ? { ...body.content.delta, segments: stripUrls(body.content.delta.segments) } : undefined,
    }
    await q(
      `update orient_module_versions set content = $2, change_policy = coalesce($3, change_policy), translations_reviewed = $4 where id = $1`,
      [v.id, JSON.stringify(content), body.change_policy ?? null, JSON.stringify(reviewed)]
    )
    res.json({ ok: true })
  })
)

router.post(
  '/versions/:id/publish',
  h(async (req, res) => {
    const v = await loadVersion(req.staff!, req.params.id, true)
    if (v.status !== 'draft') throw badRequest('Already published')
    const standard = await standardFor(v.owner_company_id)
    const problems = publishProblems(v.content, {
      languages: standard.languages,
      translationsReviewed: v.translations_reviewed,
      changePolicy: v.change_policy,
      version: v.version,
    })
    if (problems.length) throw badRequest('This version is not ready to publish', problems)

    const hash = contentHash(v.content)
    await tx(async (db) => {
      await q(
        `update orient_module_versions set status = 'published', published_at = now(), published_by = $2, content_hash = $3 where id = $1`,
        [v.id, req.staff!.userId, hash],
        db
      )
      await audit(db, staffActor(req.staff!), 'content_published', { projectId: v.project_id }, {
        module_id: v.module_id,
        module_version_id: v.id,
        title: v.module_title,
        layer: v.layer,
        version: v.version,
        change_policy: v.change_policy,
        content_hash: hash,
        translations_reviewed: v.translations_reviewed,
      })
    })
    const projects = await projectsUsingModule(v.module_id)
    for (const p of projects) await tx((db) => recomputeProject(db, p, undefined, staffActor(req.staff!)))
    res.json({ ok: true, content_hash: hash, projects_recomputed: projects.length })
  })
)

router.delete(
  '/versions/:id',
  h(async (req, res) => {
    const v = await loadVersion(req.staff!, req.params.id, true)
    if (v.status !== 'draft') throw badRequest('Published versions cannot be deleted')
    const count = await one(`select count(*)::int as n from orient_module_versions where module_id = $1`, [v.module_id])
    if (count.n === 1) throw badRequest('Archive the module instead of deleting its only version')
    await q(`delete from orient_module_versions where id = $1`, [v.id])
    res.json({ ok: true })
  })
)

// Segment images / site maps (FR-12)
router.post(
  '/media',
  h(async (req, res) => {
    const { image, module_id } = z.object({ image: z.string().max(8_000_000), module_id: z.string().uuid() }).parse(req.body)
    const m = await one(`select * from orient_modules where id = $1`, [module_id])
    if (!m) throw notFound('Module not found')
    await assertCanEditModule(req.staff!, m)
    let decoded
    try {
      decoded = decodeDataUrl(image, 5_000_000)
    } catch (e) {
      throw badRequest((e as Error).message)
    }
    const path = `modules/${module_id}/${crypto.randomUUID()}.${decoded.contentType.split('/')[1]}`
    await putMedia(path, decoded.data, decoded.contentType)
    res.json({ image_path: path, image_url: signedMediaUrl(path, 60 * 60) })
  })
)

export default router
