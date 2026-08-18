// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas/newlines, and "" escapes.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\n') {
      pushRow()
    } else if (c === '\r') {
      // skip, \n handles row end
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) pushRow()

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((key, i) => {
      obj[key] = (r[i] ?? '').trim()
    })
    return obj
  })
}
