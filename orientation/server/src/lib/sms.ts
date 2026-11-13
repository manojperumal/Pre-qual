import { config } from './config.js'

export const smsConfigured = () =>
  Boolean(config.twilio.accountSid && config.twilio.authToken && (config.twilio.from || config.twilio.messagingServiceSid))

/**
 * Send an SMS through Twilio. Without Twilio credentials (local dev) the
 * message is logged instead and the call reports `delivered: false`.
 */
export async function sendSms(to: string, body: string): Promise<{ delivered: boolean; error?: string }> {
  if (!smsConfigured()) {
    console.log(`[orientation:sms:dev] to=${to} body=${JSON.stringify(body)}`)
    return { delivered: false }
  }
  const { accountSid, authToken, from, messagingServiceSid } = config.twilio
  const params = new URLSearchParams({ To: to, Body: body })
  if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid)
  else params.set('From', from)
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[orientation:sms] Twilio error', res.status, text)
      return { delivered: false, error: `Twilio ${res.status}` }
    }
    return { delivered: true }
  } catch (err) {
    console.error('[orientation:sms] send failed', err)
    return { delivered: false, error: 'network' }
  }
}
