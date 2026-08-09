import Stripe from 'stripe'

const secretKey = process.env.STRIPE_SECRET_KEY || ''

if (!secretKey) {
  console.warn('[server] Missing STRIPE_SECRET_KEY — billing checkout will fail until it is set')
}

export const stripe = new Stripe(secretKey, {
  apiVersion: '2025-02-24.acacia',
})

export const STRIPE_PRICE_ID_PROJECT = process.env.STRIPE_PRICE_ID_PROJECT || ''
export const STRIPE_PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL || ''
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

// $150 per project, $450/year — used only as a fallback if a Checkout
// Session somehow lacks amount info; the actual charge always comes from
// the configured Stripe Price.
export const PROJECT_FEE_CENTS = 15000
export const ANNUAL_FEE_CENTS = 45000
