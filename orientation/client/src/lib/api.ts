import { staffToken } from './supabase'

const BASE = (import.meta.env.VITE_ORIENTATION_API_URL || '').replace(/\/$/, '')
const WORKER_TOKEN_KEY = 'orient_worker_token'

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}

export const mediaUrl = (path: string | null | undefined) => (path ? `${BASE}${path}` : null)

export function getWorkerToken(): string | null {
  try {
    return localStorage.getItem(WORKER_TOKEN_KEY)
  } catch {
    return null
  }
}
export function setWorkerToken(t: string | null) {
  try {
    if (t) localStorage.setItem(WORKER_TOKEN_KEY, t)
    else localStorage.removeItem(WORKER_TOKEN_KEY)
  } catch {
    /* private mode — token lives for this page only */
  }
}

async function request<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'No connection. Check your signal and try again.')
  }
  const isJson = (res.headers.get('content-type') || '').includes('json')
  const data = isJson ? await res.json() : null
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details)
  return data as T
}

export const workerApi = {
  get: <T>(p: string) => request<T>('GET', `/api/w${p}`, undefined, getWorkerToken()),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', `/api/w${p}`, b, getWorkerToken()),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', `/api/w${p}`, b, getWorkerToken()),
}

export const staffApi = {
  get: async <T>(p: string) => request<T>('GET', `/api/s${p}`, undefined, await staffToken()),
  post: async <T>(p: string, b: unknown = {}) => request<T>('POST', `/api/s${p}`, b, await staffToken()),
  put: async <T>(p: string, b: unknown) => request<T>('PUT', `/api/s${p}`, b, await staffToken()),
  del: async <T>(p: string) => request<T>('DELETE', `/api/s${p}`, undefined, await staffToken()),
}

/** Public credential check — sends the staff token when signed in to get the full gate card. */
export async function verifyCredential<T>(token: string): Promise<T> {
  return request<T>('GET', `/api/v/${encodeURIComponent(token)}`, undefined, await staffToken())
}

/** Download an export (CSV/PDF) with the staff token. */
export async function downloadExport(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString()
  const res = await fetch(`${BASE}/api/s/exports?${qs}`, { headers: { Authorization: `Bearer ${await staffToken()}` } })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error || 'Export failed')
  }
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `orientation-export.${query.format}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
