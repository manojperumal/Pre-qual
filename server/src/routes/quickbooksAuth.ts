import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { QBO_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPE, QBO_DISCOVERY, connectQuickBooks } from '../lib/quickbooks.js'

const router = Router()

async function requireMojoAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('profiles').select('is_mojo_admin').eq('id', userId).single()
  return !!data?.is_mojo_admin
}

// In-memory is fine here: this is a one-admin, one-time setup flow, and the
// state token only needs to survive the few seconds of the redirect round
// trip. Restarting the server between /connect and /callback (very unlikely
// in that window) just means the admin retries.
const pendingStates = new Set<string>()

/**
 * GET /api/quickbooks/oauth/connect
 * Mojo-admin only. Redirects to Intuit's consent screen so the admin can
 * authorize Pre-Qual's single QuickBooks company for payments.
 */
router.get('/connect', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireMojoAdmin(req.userId!))) {
    res.status(403).json({ error: 'Mojo admin access required' })
    return
  }

  const state = crypto.randomBytes(16).toString('hex')
  pendingStates.add(state)

  const authUrl = new URL(QBO_DISCOVERY.authBase)
  authUrl.searchParams.set('client_id', QBO_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', QBO_REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', QBO_SCOPE)
  authUrl.searchParams.set('state', state)

  res.json({ url: authUrl.toString() })
})

/**
 * GET /api/quickbooks/oauth/callback
 * Public (Intuit redirects the admin's browser here directly, with no
 * Authorization header) — protected instead by the one-time `state` value
 * minted in /connect. Exchanges the authorization code for tokens and
 * stores the connection.
 */
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, realmId, state, error: qboError } = req.query as Record<string, string | undefined>
  const appUrl = process.env.APP_URL || ''

  if (qboError) {
    res.redirect(`${appUrl}/mojo-admin?quickbooks=error&reason=${encodeURIComponent(qboError)}`)
    return
  }
  if (!code || !realmId || !state || !pendingStates.has(state)) {
    res.redirect(`${appUrl}/mojo-admin?quickbooks=error&reason=invalid_state`)
    return
  }
  pendingStates.delete(state)

  try {
    await connectQuickBooks(code, realmId)
    res.redirect(`${appUrl}/mojo-admin?quickbooks=connected`)
  } catch (err) {
    console.error('[quickbooks oauth] callback error:', err)
    res.redirect(`${appUrl}/mojo-admin?quickbooks=error&reason=token_exchange_failed`)
  }
})

export default router
