/**
 * LOCAL DEVELOPMENT ONLY. Creates a throwaway database with a stub of the
 * Pre-qual schema, applies the orientation migration and seeds one owner,
 * GC and two subcontractors on a project. Prints staff tokens you can paste
 * into the client's dev login (when Supabase is not configured).
 *
 *   ADMIN_DATABASE_URL=postgres://postgres@localhost:5432/postgres \
 *   SUPABASE_JWT_SECRET=dev-jwt-secret npx tsx scripts/dev-seed.ts orient_dev
 *
 * Never point this at a real Supabase database.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { signJwt } from '../src/lib/tokens.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const admin = process.env.ADMIN_DATABASE_URL
const secret = process.env.SUPABASE_JWT_SECRET
const name = process.argv[2] || 'orient_dev'
if (!admin || !secret) throw new Error('Set ADMIN_DATABASE_URL and SUPABASE_JWT_SECRET')
if (/supabase\.(co|com)/.test(admin)) throw new Error('Refusing to run against a Supabase database')

const a = new pg.Client({ connectionString: admin })
await a.connect()
await a.query(`drop database if exists ${name} with (force)`)
await a.query(`create database ${name}`)
await a.end()

const url = new URL(admin)
url.pathname = `/${name}`
const db = new pg.Client({ connectionString: url.toString() })
await db.connect()
await db.query(fs.readFileSync(path.join(here, '../test/prequal_stub.sql'), 'utf8'))
await db.query(fs.readFileSync(path.join(here, '../../../supabase/migrations/057_orientation.sql'), 'utf8'))

const co = async (n: string, t: string) => (await db.query(`insert into companies (name, type) values ($1,$2) returning id`, [n, t])).rows[0].id
const owner = await co('Acme Data Centers', 'owner')
const gc = await co('BuildRight Construction', 'gc')
const trade = await co('Sparks Electric', 'trade')
const trade2 = await co('Summit Drywall', 'trade')
const users: Record<string, string> = {}
for (const [key, companyId, type, full] of [
  ['owner', owner, 'owner', 'Olivia Owner'],
  ['gc', gc, 'gc', 'Gabe Safety'],
  ['trade', trade, 'trade', 'Tina Foreman'],
  ['trade2', trade2, 'trade', 'Dan Drywall'],
] as const) {
  const id = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`${key}@demo.test`])).rows[0].id
  await db.query(
    `insert into profiles (id, role, full_name, email, new_company_id, company_type, user_role) values ($1,$2,$3,$4,$5,$2,'admin')`,
    [id, type, full, `${key}@demo.test`, companyId]
  )
  users[key] = id
}
const project = (
  await db.query(`insert into projects (name, owner_id, address) values ('DC-1 Campus — Phase 2', $1, '1200 Server Way, Ashburn VA') returning id`, [users.owner])
).rows[0].id
const project2 = (await db.query(`insert into projects (name, owner_id, address) values ('DC-2 Expansion', $1, '88 Fiber Rd, Reno NV') returning id`, [users.owner])).rows[0].id
for (const [u, role, p] of [['gc', 'gc', project], ['trade', 'trade', project], ['trade2', 'trade', project], ['gc', 'gc', project2]] as const)
  await db.query(`insert into project_members (project_id, user_id, role) values ($1,$2,$3)`, [p, users[u], role])
await db.end()

console.log(`DATABASE_URL=${url}`)
console.log(`PROJECT_ID=${project}`)
for (const k of Object.keys(users)) console.log(`TOKEN_${k.toUpperCase()}=${signJwt({ sub: users[k], role: 'authenticated' }, secret, 60 * 60 * 24 * 7)}`)
