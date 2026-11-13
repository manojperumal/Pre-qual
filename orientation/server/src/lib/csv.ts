const cell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  let s = v instanceof Date ? v.toISOString() : String(v)
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
