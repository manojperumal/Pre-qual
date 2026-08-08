import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'mojo_impersonation'

interface ImpersonationState {
  originalAccessToken: string
  originalRefreshToken: string
  companyId: string
  companyName: string
  companyType: string
}

export function getImpersonationState(): ImpersonationState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImpersonationState
  } catch {
    return null
  }
}

export function isImpersonating(): boolean {
  return !!getImpersonationState()
}

/**
 * Saves the Mojo admin's own session, then swaps the active Supabase
 * session to the target company admin's one-time login token.
 */
export async function startImpersonation(opts: {
  hashedToken: string
  companyId: string
  companyName: string
  companyType: string
}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const original = sessionData.session
  if (!original) throw new Error('No active session to impersonate from')

  const state: ImpersonationState = {
    originalAccessToken: original.access_token,
    originalRefreshToken: original.refresh_token,
    companyId: opts.companyId,
    companyName: opts.companyName,
    companyType: opts.companyType,
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))

  const { error } = await supabase.auth.verifyOtp({
    token_hash: opts.hashedToken,
    type: 'magiclink',
  })
  if (error) {
    sessionStorage.removeItem(STORAGE_KEY)
    throw error
  }
}

/** Restores the Mojo admin's own session and clears impersonation state. */
export async function endImpersonation() {
  const state = getImpersonationState()
  if (!state) return
  sessionStorage.removeItem(STORAGE_KEY)
  await supabase.auth.setSession({
    access_token: state.originalAccessToken,
    refresh_token: state.originalRefreshToken,
  })
}
