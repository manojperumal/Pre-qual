import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { hmac } from './tokens.js'

/**
 * Private media storage (worker photos, module images). Uses a private
 * Supabase Storage bucket when service-role credentials are configured,
 * otherwise the local filesystem (dev). Media is only ever served through
 * short-lived HMAC-signed URLs issued to authorized callers.
 */

const supabase =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

let bucketChecked = false
async function ensureBucket() {
  if (!supabase || bucketChecked) return
  const { data } = await supabase.storage.getBucket(config.mediaBucket)
  if (!data) await supabase.storage.createBucket(config.mediaBucket, { public: false })
  bucketChecked = true
}

const safe = (p: string) => {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(p) || p.includes('..')) throw new Error('Invalid media path')
  return p
}

export async function putMedia(objectPath: string, data: Buffer, contentType: string): Promise<void> {
  safe(objectPath)
  if (supabase) {
    await ensureBucket()
    const { error } = await supabase.storage
      .from(config.mediaBucket)
      .upload(objectPath, data, { contentType, upsert: true })
    if (error) throw error
    return
  }
  const full = path.join(config.localMediaDir, objectPath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, data)
  await fs.writeFile(full + '.type', contentType)
}

export async function getMedia(objectPath: string): Promise<{ data: Buffer; contentType: string } | null> {
  safe(objectPath)
  if (supabase) {
    const { data, error } = await supabase.storage.from(config.mediaBucket).download(objectPath)
    if (error || !data) return null
    return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' }
  }
  const full = path.join(config.localMediaDir, objectPath)
  try {
    const [data, contentType] = await Promise.all([
      fs.readFile(full),
      fs.readFile(full + '.type', 'utf8').catch(() => 'application/octet-stream'),
    ])
    return { data, contentType }
  } catch {
    return null
  }
}

/** Relative signed URL (served by this API at /api/media). */
export function signedMediaUrl(objectPath: string | null | undefined, ttlSec = 15 * 60): string | null {
  if (!objectPath) return null
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const sig = hmac(`${objectPath}:${exp}`)
  return `/api/media?p=${encodeURIComponent(objectPath)}&exp=${exp}&sig=${sig}`
}

export function verifyMediaSignature(objectPath: string, exp: number, sig: string): boolean {
  if (!objectPath || !exp || !sig || exp < Math.floor(Date.now() / 1000)) return false
  return hmac(`${objectPath}:${exp}`) === sig
}

export function decodeDataUrl(dataUrl: string, maxBytes: number): { data: Buffer; contentType: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '')
  if (!m) throw new Error('Expected a JPEG, PNG or WebP image')
  const data = Buffer.from(m[2], 'base64')
  if (data.length > maxBytes) throw new Error(`Image too large (max ${Math.round(maxBytes / 1024)} KB)`)
  return { data, contentType: m[1] }
}
