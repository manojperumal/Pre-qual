import crypto from 'crypto'
import { supabaseAdmin } from './supabase.js'

export const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID || ''
export const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || ''
export const QBO_REDIRECT_URI = process.env.QBO_REDIRECT_URI || ''
export const QBO_ENVIRONMENT = (process.env.QBO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production'

if (!QBO_CLIENT_ID || !QBO_CLIENT_SECRET || !QBO_REDIRECT_URI) {
  console.warn('[server] Missing QBO_CLIENT_ID/QBO_CLIENT_SECRET/QBO_REDIRECT_URI — QuickBooks billing will fail until configured')
}

// Scope needed to charge cards via the Payments API. If invoicing/accounting
// features are ever added, 'com.intuit.quickbooks.accounting' would need to
// be appended (space-separated) and the sandbox company reconnected.
export const QBO_SCOPE = 'com.intuit.quickbooks.payment'

export const QBO_DISCOVERY = {
  sandbox: {
    authBase: 'https://appcenter.intuit.com/connect/oauth2',
    tokenEndpoint: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    apiBase: 'https://sandbox-quickbooks.api.intuit.com',
  },
  production: {
    authBase: 'https://appcenter.intuit.com/connect/oauth2',
    tokenEndpoint: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    apiBase: 'https://quickbooks.api.intuit.com',
  },
}[QBO_ENVIRONMENT]

export interface QuickBooksConnection {
  realmId: string
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken: string
  refreshTokenExpiresAt: Date
}

interface QBOTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  x_refresh_token_expires_in: number
}

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString('base64')
}

async function loadConnection(): Promise<QuickBooksConnection | null> {
  const { data, error } = await supabaseAdmin
    .from('quickbooks_connection')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    realmId: data.realm_id,
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(data.access_token_expires_at),
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt: new Date(data.refresh_token_expires_at),
  }
}

async function saveConnection(realmId: string, tokens: {
  access_token: string
  expires_in: number
  refresh_token: string
  x_refresh_token_expires_in: number
}): Promise<void> {
  const now = Date.now()
  const { error } = await supabaseAdmin.from('quickbooks_connection').upsert({
    id: 'default',
    environment: QBO_ENVIRONMENT,
    realm_id: realmId,
    access_token: tokens.access_token,
    access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
    refresh_token: tokens.refresh_token,
    refresh_token_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

/**
 * Exchanges an OAuth authorization code for tokens and persists the
 * connection. Called once from the /oauth/callback route after the user
 * approves access on Intuit's consent screen.
 */
export async function connectQuickBooks(code: string, realmId: string): Promise<void> {
  const res = await fetch(QBO_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: QBO_REDIRECT_URI,
    }),
  })
  if (!res.ok) {
    throw new Error(`QuickBooks token exchange failed: ${res.status} ${await res.text()}`)
  }
  const tokens = (await res.json()) as QBOTokenResponse
  await saveConnection(realmId, tokens)
}

async function refreshConnection(connection: QuickBooksConnection): Promise<QuickBooksConnection> {
  const res = await fetch(QBO_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    }),
  })
  if (!res.ok) {
    throw new Error(`QuickBooks token refresh failed: ${res.status} ${await res.text()}`)
  }
  const tokens = (await res.json()) as QBOTokenResponse
  await saveConnection(connection.realmId, tokens)
  return {
    realmId: connection.realmId,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    refreshToken: tokens.refresh_token,
    refreshTokenExpiresAt: new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000),
  }
}

// Refresh a bit before actual expiry to avoid racing a request against the
// token dying mid-flight.
const EXPIRY_SAFETY_MARGIN_MS = 60_000

/**
 * Returns a valid (non-expired) access token + realmId for the connected
 * QuickBooks company, refreshing it first if it's expired or about to be.
 * Throws if no company has been connected yet (admin needs to complete the
 * /api/quickbooks/oauth/connect flow first).
 */
export async function getValidConnection(): Promise<QuickBooksConnection> {
  const connection = await loadConnection()
  if (!connection) {
    throw new Error('QuickBooks is not connected yet — an admin must complete the OAuth connection first')
  }
  if (connection.accessTokenExpiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return connection
  }
  if (connection.refreshTokenExpiresAt.getTime() < Date.now()) {
    throw new Error('QuickBooks refresh token expired — an admin must reconnect via /api/quickbooks/oauth/connect')
  }
  return refreshConnection(connection)
}

export interface QuickBooksChargeResult {
  paymentId: string
  status: string
}

/**
 * Charges a one-time card token (produced client-side by Intuit's Web
 * Payments SDK — the card number never touches our server) via the
 * QuickBooks Payments API.
 *
 * TODO: verify this request/response shape against the live Intuit Payments
 * API reference once the sandbox app is connected — field names for the
 * charge body and the response envelope should be confirmed there before
 * relying on this in anything beyond a sandbox test.
 */
export async function chargeCard(params: { amountCents: number; currency: string; token: string }): Promise<QuickBooksChargeResult> {
  const connection = await getValidConnection()
  const amount = (params.amountCents / 100).toFixed(2)

  const res = await fetch(`${QBO_DISCOVERY.apiBase}/quickbooks/v4/payments/charges`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Intuit requires a unique idempotency key per charge attempt.
      'Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount,
      currency: params.currency.toUpperCase(),
      token: params.token,
    }),
  })

  const body = (await res.json()) as { id: string; status: string }
  if (!res.ok) {
    throw new Error(`QuickBooks charge failed: ${res.status} ${JSON.stringify(body)}`)
  }

  return { paymentId: body.id, status: body.status }
}
