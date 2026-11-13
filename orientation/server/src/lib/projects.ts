import type { Db } from './db.js'
import { one, q } from './db.js'
import { joinCode } from './tokens.js'

export interface ProjectSettings {
  project_id: string
  owner_company_id: string | null
  join_code: string
  expiry_days: number | null
  open_days_before_start: number
  ready_at: string | null
  api_key_prefix: string | null
}

/** Get (or lazily create) a project's orientation settings, including its join code. */
export async function ensureProjectSettings(projectId: string, db?: Db): Promise<ProjectSettings> {
  const existing = await one<ProjectSettings>(`select * from orient_project_settings where project_id = $1`, [projectId], db)
  if (existing) return existing
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await one<ProjectSettings>(
      `insert into orient_project_settings (project_id, owner_company_id, join_code)
       select p.id, op.new_company_id, $2
         from projects p left join profiles op on op.id = p.owner_id
        where p.id = $1
       on conflict do nothing
       returning *`,
      [projectId, joinCode()],
      db
    )
    if (row) return row
    const again = await one<ProjectSettings>(`select * from orient_project_settings where project_id = $1`, [projectId], db)
    if (again) return again
  }
  throw new Error('Could not allocate a project join code')
}

/** Companies working on a project (from Pre-qual project membership), for worker employer selection. */
export async function projectCompanies(projectId: string, db?: Db) {
  return q<{ id: string; name: string; type: string }>(
    `select distinct c.id, c.name, c.type
       from project_members pm
       join profiles p on p.id = pm.user_id
       join companies c on c.id = p.new_company_id
      where pm.project_id = $1 and c.type in ('trade', 'gc')
      order by c.name`,
    [projectId],
    db
  )
}

export const todayIso = () => new Date().toISOString().slice(0, 10)
