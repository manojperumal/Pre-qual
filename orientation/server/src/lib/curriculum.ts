import type { Db } from './db.js'
import { q, one } from './db.js'
import { audit, SYSTEM, type Actor } from './audit.js'
import {
  evaluateEnrollment,
  type CompletionInfo,
  type RequiredModule,
  type StatusResult,
} from './status.js'

/** Sections the project layer must cover before a project can go live (FR-11). */
export const REQUIRED_PROJECT_SECTIONS = [
  { key: 'site_hazards', title: 'Site-specific hazards' },
  { key: 'emergency', title: 'Emergency procedures & muster points' },
  { key: 'ppe', title: 'PPE requirements' },
  { key: 'fall_protection', title: 'Fall protection' },
  { key: 'loto', title: 'Lockout / tagout' },
  { key: 'hot_work', title: 'Hot work' },
  { key: 'confined_space', title: 'Confined space' },
  { key: 'incident_reporting', title: 'Incident reporting' },
  { key: 'stop_work', title: 'Stop-work authority' },
] as const

export const DEFAULT_EXPIRY_DAYS = 365

export interface CurriculumModule extends RequiredModule {
  trade: string | null
  projectId: string | null
  sectionKey: string | null
  position: number
  currentVersionId: string
}

export interface Curriculum {
  projectId: string
  ownerCompanyId: string | null
  modules: CurriculumModule[]
}

const layerOrder = { baseline: 0, project: 1, trade: 2 } as const

export async function loadCurriculum(projectId: string, db?: Db): Promise<Curriculum> {
  const head = await one(
    `select p.id, coalesce(s.owner_company_id, op.new_company_id) as owner_company_id,
            s.expiry_days as project_expiry, st.expiry_days as standard_expiry
       from projects p
       left join profiles op on op.id = p.owner_id
       left join orient_project_settings s on s.project_id = p.id
       left join orient_standards st on st.owner_company_id = coalesce(s.owner_company_id, op.new_company_id)
      where p.id = $1`,
    [projectId],
    db
  )
  if (!head) return { projectId, ownerCompanyId: null, modules: [] }

  const rows = await q(
    `select m.id, m.layer, m.title, m.trade, m.project_id, m.section_key, m.position, m.expiry_days,
            v.id as version_id, v.version, v.change_policy
       from orient_modules m
       join orient_module_versions v on v.module_id = m.id and v.status = 'published'
      where m.archived_at is null
        and (
              (m.layer = 'baseline' and m.owner_company_id = $2)
           or (m.layer = 'project'  and m.project_id = $1)
           or (m.layer = 'trade'    and (m.project_id = $1 or (m.project_id is null and m.owner_company_id = $2)))
        )
      order by m.id, v.version`,
    [projectId, head.owner_company_id],
    db
  )

  const fallbackExpiry = head.project_expiry ?? head.standard_expiry ?? DEFAULT_EXPIRY_DAYS
  const byModule = new Map<string, CurriculumModule>()
  for (const r of rows) {
    let m = byModule.get(r.id)
    if (!m) {
      m = {
        moduleId: r.id,
        title: r.title,
        layer: r.layer,
        trade: r.trade,
        projectId: r.project_id,
        sectionKey: r.section_key,
        position: r.position,
        expiryDays: r.expiry_days ?? fallbackExpiry,
        versions: [],
        currentVersionId: r.version_id,
      }
      byModule.set(r.id, m)
    }
    m.versions.push({ id: r.version_id, version: r.version, changePolicy: r.change_policy })
    m.currentVersionId = r.version_id // rows ordered by version asc → last wins
  }

  const modules = [...byModule.values()].sort(
    (a, b) => layerOrder[a.layer] - layerOrder[b.layer] || a.position - b.position || a.title.localeCompare(b.title)
  )
  return { projectId, ownerCompanyId: head.owner_company_id, modules }
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase()

/** Modules a worker in `trade` must complete on this project (FR-8 union of layers). */
export function requiredFor(curriculum: Curriculum, trade: string | null): CurriculumModule[] {
  return curriculum.modules.filter((m) => m.layer !== 'trade' || (trade && norm(m.trade) === norm(trade)))
}

export function tradesOffered(curriculum: Curriculum): string[] {
  const set = new Map<string, string>()
  for (const m of curriculum.modules) if (m.layer === 'trade' && m.trade) set.set(norm(m.trade), m.trade)
  return [...set.values()].sort()
}

interface EnrollmentRow {
  id: string
  worker_id: string
  project_id: string
  trade: string | null
  status: string
  expires_at: Date | null
  attested_at: Date | null
  identity_verified_at: Date | null
  revoked_at: Date | null
  revoke_kind: 'revoked' | 'suspended' | null
}

/**
 * Re-evaluate enrollments on a project and persist status/expiry/attestation
 * fields that changed. Returns the evaluation per enrollment id.
 */
export async function recomputeProject(
  db: Db,
  projectId: string,
  enrollmentIds?: string[],
  actor: Actor = SYSTEM,
  curriculum?: Curriculum
): Promise<Map<string, StatusResult>> {
  const curr = curriculum ?? (await loadCurriculum(projectId, db))
  const filter = enrollmentIds ? ' and e.id = any($2::uuid[])' : ''
  const params: unknown[] = enrollmentIds ? [projectId, enrollmentIds] : [projectId]

  const enrollments = await q<EnrollmentRow>(
    `select e.id, e.worker_id, e.project_id, e.trade, e.status, e.expires_at, e.attested_at,
            e.identity_verified_at, e.revoked_at, e.revoke_kind
       from orient_enrollments e where e.project_id = $1${filter}`,
    params,
    db
  )
  const result = new Map<string, StatusResult>()
  if (enrollments.length === 0) return result
  const ids = enrollments.map((e) => e.id)

  const [completions, attestations, progress] = await Promise.all([
    q(
      `select enrollment_id, module_version_id, completed_at
         from orient_module_completions where enrollment_id = any($1::uuid[])`,
      [ids],
      db
    ),
    q(
      `select enrollment_id, max(created_at) as at
         from orient_attestations where enrollment_id = any($1::uuid[]) group by enrollment_id`,
      [ids],
      db
    ),
    q(
      `select distinct enrollment_id from orient_module_progress where enrollment_id = any($1::uuid[])`,
      [ids],
      db
    ),
  ])

  const compBy = new Map<string, CompletionInfo[]>()
  for (const c of completions) {
    const list = compBy.get(c.enrollment_id) ?? []
    list.push({ moduleVersionId: c.module_version_id, completedAt: new Date(c.completed_at) })
    compBy.set(c.enrollment_id, list)
  }
  const attBy = new Map(attestations.map((a) => [a.enrollment_id, new Date(a.at)]))
  const progressSet = new Set(progress.map((p) => p.enrollment_id))
  const now = new Date()

  for (const e of enrollments) {
    const r = evaluateEnrollment(
      requiredFor(curr, e.trade),
      compBy.get(e.id) ?? [],
      {
        identityVerifiedAt: e.identity_verified_at,
        revokedAt: e.revoked_at,
        revokeKind: e.revoke_kind,
        latestAttestationAt: attBy.get(e.id) ?? null,
        hasAnyProgress: progressSet.has(e.id),
      },
      now
    )
    result.set(e.id, r)

    const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null)
    if (e.status !== r.status || !sameTime(e.expires_at, r.expiresAt) || !sameTime(e.attested_at, r.attestedAt)) {
      await q(
        `update orient_enrollments set status = $2, expires_at = $3, attested_at = $4 where id = $1`,
        [e.id, r.status, r.expiresAt, r.attestedAt],
        db
      )
      if (e.status !== r.status) {
        await audit(db, actor, 'status_changed', { projectId, enrollmentId: e.id, workerId: e.worker_id }, {
          from: e.status,
          to: r.status,
          expires_at: r.expiresAt,
        })
      }
    }
  }
  return result
}

/** Projects whose curriculum includes a module (used to fan out recomputes on publish). */
export async function projectsUsingModule(moduleId: string, db?: Db): Promise<string[]> {
  const m = await one(`select layer, owner_company_id, project_id from orient_modules where id = $1`, [moduleId], db)
  if (!m) return []
  if (m.project_id) return [m.project_id]
  const rows = await q(
    `select distinct e.project_id
       from orient_enrollments e
       join projects p on p.id = e.project_id
       left join profiles op on op.id = p.owner_id
       left join orient_project_settings s on s.project_id = p.id
      where coalesce(s.owner_company_id, op.new_company_id) = $1`,
    [m.owner_company_id],
    db
  )
  return rows.map((r) => r.project_id)
}

export interface ReadinessItem {
  key: string
  title: string
  ok: boolean
  detail?: string
}

/** Publishing checklist (FR-11): baseline exists and every required project section is published. */
export async function projectReadiness(projectId: string, db?: Db): Promise<{ ready: boolean; items: ReadinessItem[] }> {
  const curr = await loadCurriculum(projectId, db)
  const items: ReadinessItem[] = []
  const baseline = curr.modules.filter((m) => m.layer === 'baseline')
  items.push({
    key: 'baseline',
    title: 'Owner baseline published',
    ok: baseline.length > 0,
    detail: baseline.length ? `${baseline.length} module(s)` : 'The owner has not published a baseline yet',
  })
  for (const s of REQUIRED_PROJECT_SECTIONS) {
    const mods = curr.modules.filter((m) => m.layer === 'project' && m.sectionKey === s.key)
    items.push({
      key: s.key,
      title: s.title,
      ok: mods.length > 0,
      detail: mods.length ? mods.map((m) => m.title).join(', ') : 'No published module for this section',
    })
  }
  return { ready: items.every((i) => i.ok), items }
}
