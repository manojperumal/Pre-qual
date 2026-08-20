// Public Domo embed links are always served from a *.domo.com host over
// https. Restricting to that pattern before ever putting a URL in an
// iframe keeps a mistyped/malicious URL from being embedded as if it were
// a trusted Domo dashboard.
export function isValidDomoEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && /(^|\.)domo\.com$/i.test(parsed.hostname)
  } catch {
    return false
  }
}
