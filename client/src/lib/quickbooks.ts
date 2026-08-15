// Loads Intuit's Web Payments SDK and tokenizes card details client-side, so
// the raw card number never touches our server — only the resulting
// single-use token is sent to /api/payments/*.
//
// TODO: confirm the exact script URL and global object/method names against
// Intuit's live Web Payments SDK reference once the sandbox app is
// connected (Developer Dashboard → Payments API → Web Payments SDK docs).
// The script URL and `window.IPP.paymentTokenizer(...)` call below follow
// Intuit's documented pattern as of this writing, but should be verified
// before relying on this beyond a sandbox test.

const SDK_URL = 'https://js.appcenter.intuit.com/Content/IPP/4.0/IPPS.min.js'

let sdkLoadPromise: Promise<void> | null = null

function loadSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('QuickBooks SDK requires a browser environment'))
  if ((window as any).IPP) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load QuickBooks payment SDK'))
    document.head.appendChild(script)
  })
  return sdkLoadPromise
}

export interface CardDetails {
  name: string
  number: string
  expMonth: string
  expYear: string
  cvc: string
  postalCode: string
}

/**
 * Tokenizes card details via Intuit's Web Payments SDK and returns a
 * single-use token safe to send to our server for charging.
 */
export async function tokenizeCard(card: CardDetails): Promise<string> {
  await loadSdk()

  const IPP = (window as any).IPP
  if (!IPP?.paymentTokenizer) {
    throw new Error('QuickBooks payment SDK failed to initialize — please refresh and try again')
  }

  return new Promise((resolve, reject) => {
    IPP.paymentTokenizer(
      {
        card: {
          name: card.name,
          number: card.number.replace(/\s+/g, ''),
          expMonth: card.expMonth,
          expYear: card.expYear,
          cvc: card.cvc,
          address: { postalCode: card.postalCode },
        },
      },
      (response: any) => {
        if (response?.token) resolve(response.token)
        else reject(new Error(response?.error?.message || 'Card could not be verified'))
      }
    )
  })
}
