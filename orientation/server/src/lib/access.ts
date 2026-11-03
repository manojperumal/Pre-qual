import type { NextFunction, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { one, q, type Db } from './db.js'
import { forbidden, HttpError, notFound } from './http.js'
import { verifyJwt, verifyWorkerToken } from './tokens.js'
import type { Actor } from './audit.js'

/**
 * Staff = existing Pre-qual users (Owner / GC / Trade companies, Mojo admins),
 * authenticated with their Supabase session token. Workers = orientation-only
 * identities authenticated by SMS one-time code (see routes/worker.ts).
 */

export type CompanyType = 'owner' | 'gc' | 'trade'
export type ProjectRole = 'owner' | 'gc' | 'trade' | 'mojo'

export interface StaffContext {
  userId: string
  fullName: string | null
  email: string | null
  companyId: string | null
  companyName: string | null
  companyType: CompanyType | null
  isCompanyAdmin: boolean
  isMojoAdmin: boolean
}

declare global {
  namespace Express {
    interface Request {
      staff?: StaffContext
      workerId?: string
    }
  }
}

const supabaseAuth =
  config.supabaseUrl && config.supabaseAnonKey
    ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

async function resolveStaffUserId(token: string): Promise<string | null> {
  if (config.supabaseJwtSecret) {
    const p = verifyJwt<{ sub?: string; role?: string }>(token, config.supabaseJwtSecret)
    if (p?.sub && p.role !== 'anon') return p.sub
  }
  if (supabaseAuth) {
    const { data, error } = await supabaseAuth.auth.getUser(token)
    if (!error && data.user) return data.user.id
  }
  return null
}

export async function loadStaffContext(userId: string, db?: Db): Promise<StaffContext | null> {
  const row = await one(
    `select p.id, p.full_name, p.email, p.new_company_id, p.user_role, p.is_mojo_admin,
            coalesce(p.company_type, c.type, p.role) as company_type, c.name as company_name
       from profiles p
       left join companies c on c.id = p.new_company_id
      where p.id = $1`,
    [userId],
    db
  )
  if (!row) return null
  return {
    userId: row.id,
    fullName: row.full_name,
    email: row.email,
    companyId: row.new_company_id,
    companyName: row.company_name,
    companyType: row.company_type,
    isCompanyAdmin: row.user_role === 'admin',
    isMojoAdmin: row.is_mojo_admin === true,
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization
  return h && h.startsWith('Bearer ') ? h.slice(7) : null
}

export async function optionalStaff(req: Request): Promise<StaffContext | null> {
  const token = bearer(req)
  if (!token || verifyWorkerToken(token)) return null
  const userId = await resolveStaffUserId(token)
  return userId ? loadStaffContext(userId) : null
}

export async function requireStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const staff = await optionalStaff(req)
    if (!staff) {
      res.status(401).json({ error: 'Sign in with your Safety Mojo account' })
      return
    }
    req.staff = staff
    next()
  } catch (err) {
    next(err)
  }
}

export function requireWorker(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req)
  const workerId = token ? verifyWorkerToken(token) : null
  if (!workerId) {
    res.status(401).json({ error: 'Session expired — verify your phone number again' })
    return
  }
  req.workerId = workerId
  next()
}

export const staffActor = (s: StaffContext): Actor => ({
  type: 'staff',
  id: s.userId,
  label: [s.fullName || s.email, s.companyName].filter(Boolean).join(' — '),
})

// ─── Project access ───────────────────────────────────────────────────────────

/** The owner company of a project (the company of the project's owner profile). */
export async function projectOwnerCompany(projectId: string, db?: Db): Promise<string | null> {
  const row = await one(
    `select coalesce(s.owner_company_id, op.new_company_id) as owner_company_id
       from projects p
       left join profiles op on op.id = p.owner_id
       left join orient_project_settings s on s.project_id = p.id
      where p.id = $1`,
    [projectId],
    db
  )
  return row?.owner_company_id ?? null
}

/**
 * How `staff` relates to a project: as its owner company, a GC on it, a trade
 * on it, or Mojo admin. Owner wins over GC wins over trade.
 */
export async function projectRole(staff: StaffContext, projectId: string, db?: Db): Promise<ProjectRole | null> {
  if (staff.isMojoAdmin) return 'mojo'
  const row = await one(
    `select p.id,
            (p.owner_id = $2 or (op.new_company_id is not null and op.new_company_id = $3)) as is_owner,
            exists (select 1 from project_members pm join profiles mp on mp.id = pm.user_id
                     where pm.project_id = p.id and pm.role = 'gc'
                       and (pm.user_id = $2 or (mp.new_company_id is not null and mp.new_company_id = $3))) as is_gc,
            exists (select 1 from project_members pm join profiles mp on mp.id = pm.user_id
                     where pm.project_id = p.id
                       and (pm.user_id = $2 or (mp.new_company_id is not null and mp.new_company_id = $3))) as is_member
       from projects p
       left join profiles op on op.id = p.owner_id
      where p.id = $1`,
    [projectId, staff.userId, staff.companyId]
  , db)
  if (!row) return null
  if (row.is_owner) return 'owner'
  if (row.is_gc || (row.is_member && staff.companyType === 'gc')) return 'gc'
  if (row.is_member) return 'trade'
  return null
}

export async function requireProjectRole(
  staff: StaffContext,
  projectId: string,
  allowed: ProjectRole[] = ['owner', 'gc', 'trade', 'mojo'],
  db?: Db
): Promise<ProjectRole> {
  const role = await projectRole(staff, projectId, db)
  if (!role) throw notFound('Project not found')
  if (!allowed.includes(role)) throw forbidden('Your role on this project does not allow this action')
  return role
}

/** Project ids visible to a staff user, with their role on each. */
export async function accessibleProjects(staff: StaffContext): Promise<{ id: string; role: ProjectRole }[]> {
  if (staff.isMojoAdmin) {
    const rows = await q(`select id from projects`)
    return rows.map((r) => ({ id: r.id, role: 'mojo' as const }))
  }
  const rows = await q(
    `select p.id,
            bool_or(p.owner_id = $1 or (op.new_company_id is not null and op.new_company_id = $2)) as is_owner,
            bool_or(pm.role = 'gc' and (pm.user_id = $1 or mp.new_company_id = $2)) as is_gc,
            bool_or(pm.user_id = $1 or mp.new_company_id = $2) as is_member
       from projects p
       left join profiles op on op.id = p.owner_id
       left join project_members pm on pm.project_id = p.id
       left join profiles mp on mp.id = pm.user_id
      group by p.id
     having bool_or(p.owner_id = $1 or (op.new_company_id is not null and op.new_company_id = $2))
         or bool_or(pm.user_id = $1 or (mp.new_company_id is not null and mp.new_company_id = $2))`,
    [staff.userId, staff.companyId]
  )
  return rows.map((r) => ({
    id: r.id,
    role: r.is_owner ? 'owner' : r.is_gc || staff.companyType === 'gc' ? 'gc' : 'trade',
  }))
}

/** SQL fragment + params restricting enrollments to what this role may see. */
export function enrollmentScope(role: ProjectRole, staff: StaffContext, alias = 'e', paramIndex = 2) {
  if (role === 'trade') {
    return { sql: ` and ${alias}.company_id = $${paramIndex}`, params: [staff.companyId] }
  }
  return { sql: '', params: [] as unknown[] }
}

export function assert(cond: unknown, status: number, message: string): asserts cond {
  if (!cond) throw new HttpError(status, message)
}
