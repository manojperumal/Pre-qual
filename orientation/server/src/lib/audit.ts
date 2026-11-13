import type { Db } from './db.js'
import { q } from './db.js'

export interface Actor {
  type: 'worker' | 'staff' | 'system' | 'api'
  id?: string | null
  label?: string | null
}

export const SYSTEM: Actor = { type: 'system', id: null, label: 'Safety Mojo' }

export async function audit(
  db: Db,
  actor: Actor,
  event: string,
  ids: { projectId?: string | null; enrollmentId?: string | null; workerId?: string | null },
  payload: Record<string, unknown> = {}
): Promise<void> {
  await q(
    `insert into orient_audit_log (actor_type, actor_id, actor_label, project_id, enrollment_id, worker_id, event, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      actor.type,
      actor.id ?? null,
      actor.label ?? null,
      ids.projectId ?? null,
      ids.enrollmentId ?? null,
      ids.workerId ?? null,
      event,
      JSON.stringify(payload),
    ],
    db
  )
}
