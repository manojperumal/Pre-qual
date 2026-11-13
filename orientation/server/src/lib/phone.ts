/** Normalize a phone number to E.164. Bare 10-digit numbers are assumed to be US/Canada. */
export function normalizePhone(input: string): string | null {
  const trimmed = (input || '').trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function maskPhone(e164: string): string {
  return e164.length > 4 ? `•••• ${e164.slice(-4)}` : e164
}
