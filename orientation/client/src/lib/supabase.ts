import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Staff sign in with their existing Safety Mojo (Pre-qual) account — same Supabase project. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

const DEV_TOKEN_KEY = 'orient_dev_staff_token'

export async function staffToken(): Promise<string | null> {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }
  // Local development without Supabase: a pasted JWT (see README).
  try {
    return sessionStorage.getItem(DEV_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setDevStaffToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(DEV_TOKEN_KEY, token)
    else sessionStorage.removeItem(DEV_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export async function signOutStaff() {
  if (supabase) await supabase.auth.signOut()
  setDevStaffToken(null)
}
