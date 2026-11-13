import pg from 'pg'
import { config } from './config.js'

// Return DATE columns as 'YYYY-MM-DD' strings rather than local-midnight Dates.
pg.types.setTypeParser(1082, (v) => v)

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  ssl: /supabase\.(co|com)/.test(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
})

export type Db = pg.Pool | pg.PoolClient

export async function q<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool
): Promise<T[]> {
  const res = await db.query<T>(sql, params)
  return res.rows
}

export async function one<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool
): Promise<T | null> {
  const rows = await q<T>(sql, params, db)
  return rows[0] ?? null
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
