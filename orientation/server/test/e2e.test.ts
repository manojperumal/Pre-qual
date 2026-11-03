/**
 * End-to-end API test against a real Postgres.
 *
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
 *
 * Creates a scratch database, applies a stub of the Pre-qual schema plus the
 * orientation migration, then drives the full MVP flow through HTTP.
 * Skipped when TEST_DATABASE_URL is not set.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ADMIN_URL = process.env.TEST_DATABASE_URL
const d = ADMIN_URL ? describe : describe.skip

const JWT_SECRET = 'test-supabase-jwt-secret'
const root = path.resolve(__dirname, '..', '..', '..')
const dbName = `orient_e2e_${Date.now()}`

let base = ''
let server: any
let db: pg.Client
let signJwt: (p: any, s: string, e: number) => string
let runReminders: (now?: Date) => Promise<{ reminders: number; expired: number }>

const ids: Record<string, string> = {}
const tok: Record<string, string> = {}

async function api(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const type = res.headers.get('content-type') || ''
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer())
  return { status: res.status, data: data as any }
}

const fill = (content: any) => {
  // Make every placeholder segment publishable in EN + ES.
  content.segments = content.segments.map((s: any, i: number) => ({
    ...s,
    text: { en: `Site rule ${i + 1}: muster at the north gate.`, es: `Regla ${i + 1}: reunión en la puerta norte.` },
  }))
  return content
}
const reviewed = { es: { by: 'Ana Reviewer', at: new Date().toISOString() } }

d('orientation MVP end to end', () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL })
    await admin.connect()
    await admin.query(`create database ${dbName}`)
    await admin.end()
    const url = new URL(ADMIN_URL!)
    url.pathname = `/${dbName}`
    db = new pg.Client({ connectionString: url.toString() })
    await db.connect()
    await db.query(fs.readFileSync(path.join(__dirname, 'prequal_stub.sql'), 'utf8'))
    await db.query(fs.readFileSync(path.join(root, 'supabase/migrations/057_orientation.sql'), 'utf8'))

    // Seed Pre-qual entities: owner, GC, trade companies + users, one project.
    const co = async (name: string, type: string) =>
      (await db.query(`insert into companies (name, type) values ($1,$2) returning id`, [name, type])).rows[0].id
    ids.owner = await co('Acme Data Centers', 'owner')
    ids.gc = await co('BuildRight GC', 'gc')
    ids.trade = await co('Sparks Electric', 'trade')
    ids.trade2 = await co('Other Drywall', 'trade')
    const user = async (key: string, companyId: string, type: string) => {
      const id = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`${key}@x.test`])).rows[0].id
      await db.query(
        `insert into profiles (id, role, full_name, email, new_company_id, company_type, user_role) values ($1,$2,$3,$4,$5,$2,'admin')`,
        [id, type, `${key} user`, `${key}@x.test`, companyId]
      )
      ids[`u_${key}`] = id
    }
    await user('owner', ids.owner, 'owner')
    await user('gc', ids.gc, 'gc')
    await user('trade', ids.trade, 'trade')
    await user('trade2', ids.trade2, 'trade')
    ids.project = (
      await db.query(`insert into projects (name, owner_id, address) values ('DC-1 Campus', $1, '1 Server Way') returning id`, [ids.u_owner])
    ).rows[0].id
    for (const [u, role] of [['u_gc', 'gc'], ['u_trade', 'trade'], ['u_trade2', 'trade']])
      await db.query(`insert into project_members (project_id, user_id, role) values ($1,$2,$3)`, [ids.project, ids[u], role])

    process.env.DATABASE_URL = url.toString()
    process.env.SUPABASE_JWT_SECRET = JWT_SECRET
    process.env.ORIENTATION_LOCAL_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orient-media-'))
    process.env.ORIENTATION_EXPOSE_DEV_OTP = 'true'
    ;({ signJwt } = await import('../src/lib/tokens.js'))
    ;({ runReminders } = await import('../src/lib/scheduler.js'))
    const { createApp } = await import('../src/app.js')
    server = createApp().listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    for (const k of ['owner', 'gc', 'trade', 'trade2']) tok[k] = signJwt({ sub: ids[`u_${k}`], role: 'authenticated' }, JWT_SECRET, 3600)
  })

  afterAll(async () => {
    server?.close()
    const { pool } = await import('../src/lib/db.js')
    await pool.end()
    await db?.end()
    if (ADMIN_URL) {
      const admin = new pg.Client({ connectionString: ADMIN_URL })
      await admin.connect()
      await admin.query(`drop database if exists ${dbName} with (force)`)
      await admin.end()
    }
  })

  it('owner builds and publishes the baseline standard (FR-8, FR-9, language review)', async () => {
    expect((await api('POST', '/api/s/standard/clone-template', {}, tok.gc)).status).toBe(403)
    expect((await api('POST', '/api/s/standard/clone-template', {}, tok.owner)).data.created).toBe(4)
    const std = await api('GET', '/api/s/standard', undefined, tok.owner)
    const baseline = std.data.modules.filter((m: any) => m.layer === 'baseline')
    expect(baseline).toHaveLength(4)
    ids.baselineModule = baseline[0].id

    // Not publishable until a human confirms the Spanish translation.
    const first = await api('POST', `/api/s/versions/${baseline[0].draft.id}/publish`, {}, tok.owner)
    expect(first.status).toBe(400)
    expect(first.data.details.join(' ')).toMatch(/ES translation/)

    for (const m of baseline) {
      const v = await api('GET', `/api/s/versions/${m.draft.id}`, undefined, tok.owner)
      expect((await api('PUT', `/api/s/versions/${m.draft.id}`, { content: v.data.content, translations_reviewed: reviewed }, tok.owner)).status).toBe(200)
      expect((await api('POST', `/api/s/versions/${m.draft.id}/publish`, {}, tok.owner)).status).toBe(200)
    }
    // Published content is immutable at the database level too.
    await expect(db.query(`update orient_module_versions set content = '{}' where module_id = $1`, [ids.baselineModule])).rejects.toThrow(/immutable/)
  })

  it('GC cannot weaken the owner baseline (FR-9)', async () => {
    expect((await api('POST', `/api/s/modules/${ids.baselineModule}/archive`, {}, tok.gc)).status).toBe(403)
    expect((await api('PUT', `/api/s/modules/${ids.baselineModule}`, { title: 'Weakened' }, tok.gc)).status).toBe(403)
    expect((await api('POST', `/api/s/modules/${ids.baselineModule}/draft`, {}, tok.gc)).status).toBe(403)
    expect((await api('POST', '/api/s/modules', { layer: 'baseline', title: 'GC baseline' }, tok.gc)).status).toBe(403)
  })

  it('GC completes the project layer checklist and opens the project (FR-11)', async () => {
    const proj = await api('GET', `/api/s/projects/${ids.project}`, undefined, tok.gc)
    expect(proj.data.role).toBe('gc')
    ids.joinCode = proj.data.settings.join_code

    expect((await api('POST', `/api/s/projects/${ids.project}/ready`, { ready: true }, tok.gc)).status).toBe(400)
    expect((await api('POST', `/api/s/projects/${ids.project}/sections/scaffold`, {}, tok.gc)).data.created).toHaveLength(9)
    const mods = await api('GET', `/api/s/projects/${ids.project}/modules`, undefined, tok.gc)
    expect(mods.data.project_modules).toHaveLength(9)
    let readiness = await api('GET', `/api/s/projects/${ids.project}/readiness`, undefined, tok.gc)
    expect(readiness.data.items.filter((i: any) => !i.ok)).toHaveLength(9)

    for (const m of mods.data.project_modules) {
      const v = await api('GET', `/api/s/versions/${m.draft.id}`, undefined, tok.gc)
      await api('PUT', `/api/s/versions/${m.draft.id}`, { content: fill(v.data.content), translations_reviewed: reviewed }, tok.gc)
      const pub = await api('POST', `/api/s/versions/${m.draft.id}/publish`, {}, tok.gc)
      expect(pub.status, JSON.stringify(pub.data)).toBe(200)
    }
    readiness = await api('GET', `/api/s/projects/${ids.project}/readiness`, undefined, tok.gc)
    expect(readiness.data.ready).toBe(true)

    // Trade layer: an Electrical module with a comprehension check.
    const tm = await api('POST', '/api/s/modules', { layer: 'trade', project_id: ids.project, trade: 'Electrical', title: 'Energized work' }, tok.gc)
    expect(tm.status).toBe(200)
    const mod = await api('GET', `/api/s/modules/${tm.data.id}`, undefined, tok.gc)
    const content = {
      segments: [{ id: 's1', text: { en: 'Treat every conductor as live.', es: 'Trate cada conductor como energizado.' } }],
      checks: [
        {
          id: 'c1',
          prompt: { en: 'How do you treat a conductor?', es: '¿Cómo trata un conductor?' },
          options: { en: ['As live', 'As dead'], es: ['Energizado', 'Desenergizado'] },
          correct_index: 0,
          reteach: { en: 'Assume voltage is present until it is tested.', es: 'Suponga que hay voltaje hasta probarlo.' },
        },
      ],
    }
    await api('PUT', `/api/s/versions/${mod.data.versions[0].id}`, { content, translations_reviewed: reviewed }, tok.gc)
    expect((await api('POST', `/api/s/versions/${mod.data.versions[0].id}/publish`, {}, tok.gc)).status).toBe(200)
    expect((await api('POST', `/api/s/projects/${ids.project}/ready`, { ready: true }, tok.gc)).status).toBe(200)
  })

  it('subcontractor bulk-invites a crew (FR-20)', async () => {
    const r = await api(
      'POST',
      `/api/s/projects/${ids.project}/invites`,
      { entries: [{ phone: '(555) 201-0001', full_name: 'Luis Ortega', crew: 'Crew A', trade: 'Electrical' }, { phone: '12' }] },
      tok.trade
    )
    expect(r.status).toBe(200)
    expect(r.data.invited).toBe(1)
    expect(r.data.results.find((x: any) => !x.ok).error).toMatch(/Invalid/)
  })

  it('worker registers by SMS code and completes orientation in Spanish (FR-1…FR-6)', async () => {
    const info = await api('GET', `/api/w/projects/${ids.joinCode.toLowerCase()}`)
    expect(info.status).toBe(200)
    expect(info.data.open).toBe(true)
    expect(info.data.trades).toEqual(['Electrical'])
    expect(info.data.companies.map((c: any) => c.name)).toContain('Sparks Electric')

    const start = await api('POST', '/api/w/otp/start', { phone: '555-201-0001', lang: 'es' })
    expect(start.data.dev_code).toMatch(/^\d{6}$/)
    expect((await api('POST', '/api/w/otp/verify', { phone: '5552010001', code: '000000' === start.data.dev_code ? '111111' : '000000' })).status).toBe(400)
    const verify = await api('POST', '/api/w/otp/verify', { phone: '+15552010001', code: start.data.dev_code })
    expect(verify.status).toBe(200)
    tok.worker = verify.data.token

    // Invite pre-fills company, crew and trade.
    const en = await api('POST', '/api/w/enroll', { join_code: ids.joinCode, full_name: 'Luis Ortega', language: 'es' }, tok.worker)
    expect(en.status, JSON.stringify(en.data)).toBe(200)
    ids.enrollment = en.data.enrollment_id
    const row = (await db.query(`select company_id, crew, trade from orient_enrollments where id = $1`, [ids.enrollment])).rows[0]
    expect(row).toMatchObject({ company_id: ids.trade, crew: 'Crew A', trade: 'Electrical' })

    let plan = await api('GET', `/api/w/enrollments/${ids.enrollment}/plan?lang=es`, undefined, tok.worker)
    expect(plan.data.locked).toBeNull()
    expect(plan.data.modules).toHaveLength(4 + 9 + 1)
    expect(plan.data.enrollment.status).toBe('not_started')

    // Can't complete without going through the content.
    const m0 = plan.data.modules[0]
    expect((await api('POST', `/api/w/enrollments/${ids.enrollment}/modules/${m0.version_id}/complete`, { language: 'es' }, tok.worker)).status).toBe(400)

    let sawReteach = false
    for (const m of plan.data.modules) {
      const mod = await api('GET', `/api/w/enrollments/${ids.enrollment}/modules/${m.version_id}?lang=es`, undefined, tok.worker)
      expect(mod.status).toBe(200)
      expect(JSON.stringify(mod.data)).not.toContain('correct_index') // answer key never sent
      await api('POST', `/api/w/enrollments/${ids.enrollment}/progress`, { items: [{ module_version_id: m.version_id, segment_index: mod.data.segments.length, language: 'es' }] }, tok.worker)
      const content = (await db.query(`select content from orient_module_versions where id = $1`, [m.version_id])).rows[0].content
      for (const c of content.checks) {
        const wrong = (c.correct_index + 1) % c.options.es.length
        const bad = await api('POST', `/api/w/enrollments/${ids.enrollment}/checks`, { module_version_id: m.version_id, check_id: c.id, selected_index: wrong, language: 'es' }, tok.worker)
        expect(bad.data.correct).toBe(false)
        expect(bad.data.reteach).toBe(c.reteach.es)
        sawReteach = true
        // A failed check blocks completion.
        expect((await api('POST', `/api/w/enrollments/${ids.enrollment}/modules/${m.version_id}/complete`, { language: 'es' }, tok.worker)).status).toBe(400)
        const good = await api('POST', `/api/w/enrollments/${ids.enrollment}/checks`, { module_version_id: m.version_id, check_id: c.id, selected_index: c.correct_index, language: 'es' }, tok.worker)
        expect(good.data).toEqual({ correct: true, reteach: null })
      }
      const done = await api('POST', `/api/w/enrollments/${ids.enrollment}/modules/${m.version_id}/complete`, { language: 'es' }, tok.worker)
      expect(done.status, JSON.stringify(done.data)).toBe(200)
    }
    expect(sawReteach).toBe(true)

    plan = await api('GET', `/api/w/enrollments/${ids.enrollment}/plan?lang=es`, undefined, tok.worker)
    expect(plan.data.ready_to_attest).toBe(true)
    expect(plan.data.attestation_statement).toMatch(/^Confirmo/)

    // Photo is required before attesting (FR-13).
    expect((await api('POST', `/api/w/enrollments/${ids.enrollment}/attest`, { signed_name: 'Luis Ortega', language: 'es' }, tok.worker)).status).toBe(400)
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    expect((await api('POST', '/api/w/photo', { image: png }, tok.worker)).status).toBe(200)
    const att = await api('POST', `/api/w/enrollments/${ids.enrollment}/attest`, { signed_name: 'Luis Ortega', language: 'es' }, tok.worker)
    expect(att.status).toBe(200)
    expect(att.data.enrollment.status).toBe('pending_verification')
    ids.token = att.data.enrollment.credential_token

    const attRow = (await db.query(`select manifest, language from orient_attestations where enrollment_id = $1`, [ids.enrollment])).rows[0]
    expect(attRow.manifest).toHaveLength(14)
    expect(attRow.manifest.every((m: any) => m.content_hash && m.completed_at)).toBe(true)
    await expect(db.query(`delete from orient_attestations`)).rejects.toThrow(/append-only/)
  })

  it('gate verifies photo identity and the credential reports live status (FR-13…FR-15)', async () => {
    const pub0 = await api('GET', `/api/v/${ids.token}`)
    expect(pub0.data).toMatchObject({ full: false, display_name: 'Luis O.', effective_status: 'pending_verification' })

    const card = await api('GET', `/api/s/gate/lookup?token=${encodeURIComponent(`https://x/v/${ids.token}`)}&project_id=${ids.project}`, undefined, tok.gc)
    expect(card.status).toBe(200)
    expect(card.data.photo_url).toMatch(/^\/api\/media\?/)
    expect((await fetch(base + card.data.photo_url)).status).toBe(200)
    expect((await fetch(base + card.data.photo_url.replace(/sig=[a-f0-9]+/, 'sig=bad'))).status).toBe(403)

    // Another subcontractor can't look this worker up.
    expect((await api('GET', `/api/s/gate/lookup?token=${ids.token}`, undefined, tok.trade2)).status).toBe(403)

    const v = await api('POST', `/api/s/enrollments/${ids.enrollment}/verify-identity`, { match: true }, tok.gc)
    expect(v.data.effective_status).toBe('cleared')
    expect((await api('GET', `/api/v/${ids.token}`)).data.effective_status).toBe('cleared')

    const search = await api('GET', `/api/s/projects/${ids.project}/gate/search?q=ortega`, undefined, tok.gc)
    expect(search.data).toHaveLength(1)
    expect((await api('GET', `/api/s/projects/${ids.project}/gate/search?q=0001`, undefined, tok.gc)).data).toHaveLength(1)
  })

  it('compliance, roster and portfolio views agree (FR-18…FR-20, FR-26)', async () => {
    const c = await api('GET', `/api/s/projects/${ids.project}/compliance`, undefined, tok.gc)
    expect(c.data.summary).toMatchObject({ total: 1, cleared: 1 })
    expect(c.data.companies[0]).toMatchObject({ name: 'Sparks Electric', total: 1 })

    const other = await api('GET', `/api/s/projects/${ids.project}/compliance`, undefined, tok.trade2)
    expect(other.data.summary.total).toBe(0) // subs see only their own workers

    const roster = await api('GET', `/api/s/projects/${ids.project}/roster`, undefined, tok.trade)
    expect(roster.data.workers).toHaveLength(1)
    expect(roster.data.workers[0].remaining).toEqual([])

    const pf = await api('GET', '/api/s/portfolio', undefined, tok.owner)
    expect(pf.data.totals.cleared).toBe(1)
    expect(pf.data.projects[0].gcs[0].name).toBe('BuildRight GC')
    expect((await api('GET', '/api/s/portfolio', undefined, tok.gc)).data.projects).toHaveLength(0)

    // FR-26: Pre-qual reads compliance through the security-definer function.
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ids.u_gc])
    const fn = await db.query(`select * from orient_company_compliance($1)`, [ids.trade])
    expect(fn.rows[0]).toMatchObject({ workers: 1, cleared: 1 })
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ids.u_trade2])
    expect((await db.query(`select * from orient_company_compliance($1)`, [ids.owner])).rows).toHaveLength(0)
  })

  it('content versioning: new_only keeps clearance, full forces refresh (FR-8, FR-10)', async () => {
    const draft = async (moduleId: string, policy: string) => {
      const d1 = await api('POST', `/api/s/modules/${moduleId}/draft`, {}, tok.owner)
      const v = await api('GET', `/api/s/versions/${d1.data.id}`, undefined, tok.owner)
      v.data.content.segments[0].text.en += ' (updated)'
      v.data.content.segments[0].text.es += ' (actualizado)'
      await api('PUT', `/api/s/versions/${d1.data.id}`, { content: v.data.content, change_policy: policy, translations_reviewed: reviewed }, tok.owner)
      const p = await api('POST', `/api/s/versions/${d1.data.id}/publish`, {}, tok.owner)
      expect(p.status, JSON.stringify(p.data)).toBe(200)
      return d1.data.id
    }
    await draft(ids.baselineModule, 'new_only')
    let card = await api('GET', `/api/s/enrollments/${ids.enrollment}`, undefined, tok.gc)
    expect(card.data.card.effective_status).toBe('cleared')

    const vFull = await draft(ids.baselineModule, 'full')
    card = await api('GET', `/api/s/enrollments/${ids.enrollment}`, undefined, tok.gc)
    expect(card.data.card.effective_status).toBe('refresh_required')
    expect(card.data.modules.find((m: any) => m.moduleId === ids.baselineModule).superseded).toBe(true)
    expect((await api('GET', `/api/v/${ids.token}`)).data.effective_status).toBe('refresh_required')

    // Auditor retrieves the exact old version the worker completed.
    const old = card.data.completions.find((c: any) => c.title === 'Welcome and your safety rights')
    const oldV = await api('GET', `/api/s/versions/${old.version_id}`, undefined, tok.owner)
    expect(oldV.data.version).toBe(1)
    expect(oldV.data.content.segments[0].text.en).not.toContain('(updated)')

    // Worker re-completes just that module and re-attests → cleared again.
    const plan = await api('GET', `/api/w/enrollments/${ids.enrollment}/plan?lang=en`, undefined, tok.worker)
    const todo = plan.data.modules.filter((m: any) => m.state !== 'complete')
    expect(todo.map((m: any) => m.version_id)).toEqual([vFull])
    const content = (await db.query(`select content from orient_module_versions where id = $1`, [vFull])).rows[0].content
    await api('POST', `/api/w/enrollments/${ids.enrollment}/progress`, { items: [{ module_version_id: vFull, segment_index: content.segments.length, language: 'en' }] }, tok.worker)
    for (const c of content.checks)
      await api('POST', `/api/w/enrollments/${ids.enrollment}/checks`, { module_version_id: vFull, check_id: c.id, selected_index: c.correct_index, language: 'en' }, tok.worker)
    expect((await api('POST', `/api/w/enrollments/${ids.enrollment}/modules/${vFull}/complete`, { language: 'en' }, tok.worker)).status).toBe(200)
    const att = await api('POST', `/api/w/enrollments/${ids.enrollment}/attest`, { signed_name: 'Luis Ortega', language: 'en' }, tok.worker)
    expect(att.data.enrollment.status).toBe('cleared') // identity already verified for this enrollment
  })

  it('revocation is immediate, audited and visible to badge systems (FR-15, FR-16)', async () => {
    expect((await api('POST', `/api/s/enrollments/${ids.enrollment}/revoke`, { kind: 'revoked', category: 'other', reason: 'x' }, tok.trade)).status).toBe(403)
    expect((await api('POST', `/api/s/enrollments/${ids.enrollment}/revoke`, { kind: 'revoked', category: 'other', reason: '' }, tok.gc)).status).toBe(400)

    const key = await api('POST', `/api/s/projects/${ids.project}/api-key`, {}, tok.gc)
    expect(key.data.api_key).toMatch(/^omk_/)
    expect((await api('GET', '/api/v1/clearances', undefined, 'omk_bad')).status).toBe(401)

    const r = await api('POST', `/api/s/enrollments/${ids.enrollment}/revoke`, { kind: 'suspended', category: 'safety_violation', reason: 'No harness at height' }, tok.gc)
    expect(r.data.effective_status).toBe('suspended')
    const ext = await api('GET', '/api/v1/clearances', undefined, key.data.api_key)
    expect(ext.data.workers[0]).toMatchObject({ status: 'suspended', cleared: false })
    const one = await api('GET', `/api/v1/credentials/${ids.token}`, undefined, key.data.api_key)
    expect(one.data.cleared).toBe(false)

    // Gate sees reason category; anonymous scan does not.
    expect((await api('GET', `/api/s/gate/lookup?token=${ids.token}`, undefined, tok.gc)).data.revoke_category).toBe('safety_violation')
    expect((await api('GET', `/api/v/${ids.token}`)).data.revoke_category).toBeUndefined()

    const back = await api('POST', `/api/s/enrollments/${ids.enrollment}/reinstate`, { reason: 'Retrained on fall protection' }, tok.gc)
    expect(back.data.effective_status).toBe('cleared')
  })

  it('exports a full audit record as CSV and PDF (FR-25) and the audit chain verifies (FR-24)', async () => {
    const csv = await api('GET', `/api/s/exports?scope=project&id=${ids.project}&format=csv`, undefined, tok.owner)
    expect(csv.status).toBe(200)
    const text = csv.data.toString('utf8')
    expect(text).toMatch(/^record_type,timestamp/)
    expect(text).toContain('attestation')
    expect(text).toContain('clearance_suspended')
    const pdf = await api('GET', `/api/s/exports?scope=worker&id=${ids.enrollment}&format=pdf`, undefined, tok.gc)
    expect(pdf.status).toBe(200)
    expect(pdf.data.subarray(0, 4).toString()).toBe('%PDF')
    expect((await api('GET', `/api/s/exports?scope=project&id=${ids.project}`, undefined, tok.trade2)).status).toBe(404)

    await expect(db.query(`update orient_audit_log set event = 'x'`)).rejects.toThrow(/append-only/)
    const chain = await db.query(`select * from orient_audit_log order by id`)
    let prev = 'genesis'
    for (const r of chain.rows) {
      expect(r.prev_hash).toBe(prev)
      prev = r.hash
    }
    const events = new Set(chain.rows.map((r: any) => r.event))
    for (const e of ['registered', 'module_completed', 'attested', 'identity_verified', 'content_published', 'clearance_suspended', 'clearance_reinstated', 'export_generated'])
      expect(events).toContain(e)
  })

  it('sends expiry reminders and logs expiry once (FR-21)', async () => {
    const e = (await db.query(`select expires_at from orient_enrollments where id = $1`, [ids.enrollment])).rows[0]
    const expires = new Date(e.expires_at)
    const r1 = await runReminders(new Date(expires.getTime() - 5 * 86400000))
    expect(r1.reminders).toBe(1)
    expect((await runReminders(new Date(expires.getTime() - 5 * 86400000))).reminders).toBe(0) // idempotent
    const notes = await db.query(`select user_id from notifications where type = 'orientation_expiry'`)
    expect(notes.rows.map((n) => n.user_id).sort()).toEqual([ids.u_gc, ids.u_trade].sort())
    const r2 = await runReminders(new Date(expires.getTime() + 1000))
    expect(r2.expired).toBe(1)
    expect((await runReminders(new Date(expires.getTime() + 2000))).expired).toBe(0)
  })
})
