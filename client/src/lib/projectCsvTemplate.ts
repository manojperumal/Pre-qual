export const PROJECT_CSV_HEADERS = ['name', 'description', 'address', 'start_date', 'end_date']

export const PROJECT_CSV_TEMPLATE =
  PROJECT_CSV_HEADERS.join(',') +
  '\n' +
  'Downtown Office Tower,Brief description of the project,"123 Main St, Austin, TX 78701",2026-01-15,2026-12-31\n'

export function downloadProjectCsvTemplate() {
  const blob = new Blob([PROJECT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'projects_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
