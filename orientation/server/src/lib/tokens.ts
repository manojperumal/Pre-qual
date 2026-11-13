import crypto from 'node:crypto'
import { config } from './config.js'

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export function signJwt(payload: Record<string, unknown>, secret: string, expiresInSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(JSON.stringify({ iat: now, exp: now + expiresInSec, ...payload }))
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest())
  return `${header}.${body}.${sig}`
}

export function verifyJwt<T = Record<string, any>>(token: string, secret: string): T | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  try {
    const h = JSON.parse(fromB64url(header).toString())
    if (h.alg !== 'HS256') return null
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
    const given = fromB64url(sig)
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
    const payload = JSON.parse(fromB64url(body).toString())
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload as T
  } catch {
    return null
  }
}

const WORKER_TOKEN_TTL = 60 * 60 * 24 * 30 // 30 days

export function signWorkerToken(workerId: string): string {
  return signJwt({ sub: workerId, kind: 'worker' }, config.tokenSecret, WORKER_TOKEN_TTL)
}

export function verifyWorkerToken(token: string): string | null {
  const p = verifyJwt<{ sub: string; kind: string }>(token, config.tokenSecret)
  return p && p.kind === 'worker' ? p.sub : null
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export function hmac(s: string): string {
  return crypto.createHmac('sha256', config.tokenSecret).update(s).digest('hex')
}

export function randomCode(digits = 6): string {
  return crypto.randomInt(0, 10 ** digits).toString().padStart(digits, '0')
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex')
}

/** Short, human-friendly join code for a project link / site QR (no ambiguous chars). */
export function joinCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[crypto.randomInt(0, alphabet.length)]
  return out
}
