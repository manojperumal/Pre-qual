import { Router } from 'express'
import { one, pool, q } from '../lib/db.js'
import { h, notFound } from '../lib/http.js'
import { optionalStaff, projectRole, staffActor } from '../lib/access.js'
import { audit } from '../lib/audit.js'
import { getMedia, verifyMediaSignature } from '../lib/storage.js'
import { recomputeProject } from '../lib/curriculum.js'
import { sha256 } from '../lib/tokens.js'
import { gateCard } from './staff.js'

const router = Router()

/**
 * Credential check (FR-14). Anyone scanning a worker's QR sees live status
 * with minimal personal data; an authorized staff user for that project sees
 * the full gate card including photo.
 */
router.get(
  '/v/:token',
  h(async (req, res) => {
    const e = await one(`select id, project_id, company_id from orient_enrollments where credential_token = $1`, [req.params.token])
    if (!e) throw notFound('Credential not recognized')
    await recomputeProject(pool, e.project_id, [e.id])
    const staff = await optionalStaff(req)
    const role = staff ? await projectRole(staff, e.project_id) : null
    const authorized = role && (role !== 'trade' || e.company_id === staff!.companyId)
    const card = await gateCard(e.id, authorized ? role : null)
    if (!card) throw notFound('Credential not recognized')
    if (authorized) {
      await audit(pool, staffActor(staff!), 'credential_scanned', { projectId: e.project_id, enrollmentId: e.id }, { result: card.effective_status })
      return res.json({ ...card, full: true })
    }
    const [first, ...rest] = (card.full_name || '').split(' ')
    res.json({
      full: false,
      display_name: `${first}${rest.length ? ` ${rest[rest.length - 1][0]}.` : ''}`,
      project_name: card.project_name,
      company_name: card.company_name,
      trade: card.trade,
      effective_status: card.effective_status,
      expires_at: card.expires_at,
      checked_at: card.checked_at,
    })
  })
)

router.get(
  '/media',
  h(async (req, res) => {
    const p = String(req.query.p || '')
    if (!verifyMediaSignature(p, Number(req.query.exp), String(req.query.sig || ''))) {
      res.status(403).json({ error: 'Link expired' })
      return
    }
    const media = await getMedia(p)
    if (!media) throw notFound()
    res.setHeader('Content-Type', media.contentType)
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.send(media.data)
  })
)

export default router

// ─── Badge / access-control systems (FR-15) ───────────────────────────────────

export const externalRouter = Router()

externalRouter.use(
  h(async (req, res, next) => {
    const auth = req.headers.authorization || ''
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-api-key'] || '')
    const settings = key.startsWith('omk_')
      ? await one(`select project_id from orient_project_settings where api_key_hash = $1`, [sha256(key)])
      : null
    if (!settings) {
      res.status(401).json({ error: 'Invalid API key' })
      return
    }
    ;(req as any).apiProjectId = settings.project_id
    next()
  })
)

/**
 * GET /api/v1/clearances?since=ISO — every worker on the key's project with
 * live clearance status. Badge systems poll this (or use `since` for deltas).
 * Expiry/revocation are evaluated at read time, so changes are reflected
 * immediately.
 */
externalRouter.get(
  '/clearances',
  h(async (req, res) => {
    const projectId = (req as any).apiProjectId
    const since = req.query.since ? new Date(String(req.query.since)) : null
    const rows = await q(
      `select s.id as enrollment_id, s.worker_id, w.full_name, coalesce(c.name, s.employer_name) as company, s.company_id,
              s.trade, s.crew, s.effective_status as status, (s.effective_status = 'cleared') as cleared,
              s.expires_at, s.credential_token, greatest(s.updated_at, w.updated_at) as updated_at
         from orient_enrollment_status s join orient_workers w on w.id = s.worker_id left join companies c on c.id = s.company_id
        where s.project_id = $1
          and ($2::timestamptz is null or greatest(s.updated_at, w.updated_at) >= $2 or (s.expires_at between $2 and now()))
        order by w.full_name`,
      [projectId, since && !isNaN(since.getTime()) ? since : null]
    )
    await audit(pool, { type: 'api', id: projectId, label: 'Access-control API' }, 'api_clearances_read', { projectId }, { count: rows.length })
    res.json({ project_id: projectId, generated_at: new Date().toISOString(), workers: rows })
  })
)

externalRouter.get(
  '/credentials/:token',
  h(async (req, res) => {
    const projectId = (req as any).apiProjectId
    const row = await one(
      `select s.id as enrollment_id, s.worker_id, w.full_name, s.effective_status as status, (s.effective_status = 'cleared') as cleared,
              s.expires_at, s.trade
         from orient_enrollment_status s join orient_workers w on w.id = s.worker_id
        where s.credential_token = $1 and s.project_id = $2`,
      [req.params.token, projectId]
    )
    if (!row) throw notFound('Credential not recognized for this project')
    res.json(row)
  })
)
