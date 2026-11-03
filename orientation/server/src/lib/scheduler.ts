import { config } from './config.js'
import { pool, q, tx } from './db.js'
import { audit, SYSTEM } from './audit.js'
import { recomputeProject } from './curriculum.js'
import { sendSms } from './sms.js'

/**
 * Background jobs (FR-21):
 *  - advance expiry reminders to the worker (SMS), their subcontractor's
 *    admins and the project's GC team (in-app notifications, shared with Pre-qual)
 *  - a one-time "expired" event + notification when clearance lapses
 *    (status itself flips at read time — no manual step)
 *  - periodic recompute as a safety net for status drift
 */

const DAY = 86400000

async function notifyStaff(projectId: string, companyId: string | null, title: string, body: string, link: string) {
  const recipients = await q(
    `select distinct pr.id from profiles pr
      where (pr.new_company_id = $2 and pr.user_role = 'admin')
         or pr.id in (select pm.user_id from project_members pm where pm.project_id = $1 and pm.role = 'gc')`,
    [projectId, companyId]
  )
  for (const r of recipients) {
    await q(`insert into notifications (user_id, type, title, body, link) values ($1, 'orientation_expiry', $2, $3, $4)`, [
      r.id,
      title,
      body,
      link,
    ])
  }
  return recipients.length
}

async function claim(enrollmentId: string, kind: string): Promise<boolean> {
  const rows = await q(
    `insert into orient_reminders_sent (enrollment_id, kind) values ($1, $2) on conflict do nothing returning kind`,
    [enrollmentId, kind]
  )
  return rows.length > 0
}

export async function runReminders(now = new Date()): Promise<{ reminders: number; expired: number }> {
  let reminders = 0
  let expired = 0
  const rows = await q(
    `select s.id, s.project_id, s.company_id, s.worker_id, s.expires_at, s.effective_status, w.full_name, w.phone,
            w.preferred_language, p.name as project_name, ps.join_code,
            coalesce(st.reminder_days, '{30,7,1}') as reminder_days
       from orient_enrollment_status s
       join orient_workers w on w.id = s.worker_id
       join projects p on p.id = s.project_id
       left join orient_project_settings ps on ps.project_id = s.project_id
       left join orient_standards st on st.owner_company_id = ps.owner_company_id
      where s.expires_at is not null and s.revoked_at is null
        and s.status in ('cleared', 'pending_verification')
        and s.expires_at <= $1::timestamptz + interval '400 days'`,
    [now]
  )
  for (const r of rows) {
    const expiresAt = new Date(r.expires_at)
    const expKey = expiresAt.toISOString().slice(0, 10)
    const link = `${config.appUrl}/o/${r.join_code}`
    const es = r.preferred_language === 'es'

    if (expiresAt <= now) {
      if (!(await claim(r.id, `expired:${expKey}`))) continue
      expired++
      await audit(pool, SYSTEM, 'clearance_expired', { projectId: r.project_id, enrollmentId: r.id, workerId: r.worker_id }, { expires_at: expiresAt })
      await sendSms(
        r.phone,
        es
          ? `Safety Mojo: su orientación para ${r.project_name} venció. Renuévela antes de su próximo turno: ${link}`
          : `Safety Mojo: your orientation for ${r.project_name} has expired. Renew it before your next shift: ${link}`
      )
      await notifyStaff(r.project_id, r.company_id, 'Orientation expired', `${r.full_name}'s orientation for ${r.project_name} expired.`, `${config.appUrl}/staff/projects/${r.project_id}`)
      continue
    }

    const daysLeft = (expiresAt.getTime() - now.getTime()) / DAY
    const due = (r.reminder_days as number[]).filter((d) => daysLeft <= d).sort((a, b) => a - b)
    if (due.length === 0) continue
    // Mark every threshold already passed, but message once — for the closest one.
    let fresh = false
    for (const d of due) if (await claim(r.id, `expiry:${expKey}:${d}`)) fresh = fresh || d === due[0]
    if (!fresh) continue
    reminders++
    const days = Math.max(1, Math.ceil(daysLeft))
    await audit(pool, SYSTEM, 'expiry_reminder_sent', { projectId: r.project_id, enrollmentId: r.id, workerId: r.worker_id }, { days_left: days })
    await sendSms(
      r.phone,
      es
        ? `Safety Mojo: su orientación para ${r.project_name} vence en ${days} día(s). Renuévela aquí: ${link}`
        : `Safety Mojo: your orientation for ${r.project_name} expires in ${days} day(s). Renew here: ${link}`
    )
    await notifyStaff(
      r.project_id,
      r.company_id,
      'Orientation expiring',
      `${r.full_name}'s orientation for ${r.project_name} expires in ${days} day(s).`,
      `${config.appUrl}/staff/projects/${r.project_id}`
    )
  }
  return { reminders, expired }
}

export async function recomputeAll() {
  const projects = await q(`select distinct project_id from orient_enrollments`)
  for (const p of projects) await tx((db) => recomputeProject(db, p.project_id))
}

let timer: NodeJS.Timeout | null = null

export function startScheduler() {
  const tick = async () => {
    try {
      await recomputeAll()
      const r = await runReminders()
      if (r.reminders || r.expired) console.log(`[orientation:scheduler] reminders=${r.reminders} expired=${r.expired}`)
    } catch (err) {
      console.error('[orientation:scheduler] tick failed', err)
    }
  }
  setTimeout(tick, 5000)
  timer = setInterval(tick, config.schedulerIntervalMs)
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
}
