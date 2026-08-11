import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useBulkCreateProjects, BulkProjectRow } from '@/hooks/useProjects'
import { parseCSV, rowsToObjects } from '@/lib/csv'
import { ChevronRight, Download, Upload, AlertCircle } from 'lucide-react'

const TEMPLATE_HEADERS = ['name', 'description', 'address', 'start_date', 'end_date']
const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(',') +
  '\n' +
  'Downtown Office Tower,Brief description of the project,"123 Main St, Austin, TX 78701",2026-01-15,2026-12-31\n'

interface ParsedRow extends BulkProjectRow {
  rowNumber: number
  error?: string
}

function validateRow(raw: Record<string, string>, rowNumber: number): ParsedRow {
  const name = raw['name'] ?? ''
  const row: ParsedRow = {
    rowNumber,
    name,
    description: raw['description'] || undefined,
    address: raw['address'] || undefined,
    startDate: raw['start_date'] || undefined,
    endDate: raw['end_date'] || undefined,
  }

  if (!name.trim()) {
    row.error = 'Project name is required'
    return row
  }

  const dateFields: [string, string | undefined][] = [
    ['start_date', row.startDate],
    ['end_date', row.endDate],
  ]
  for (const [label, value] of dateFields) {
    if (value && Number.isNaN(Date.parse(value))) {
      row.error = `Invalid ${label}: "${value}" (use YYYY-MM-DD)`
      return row
    }
  }

  return row
}

export default function BulkUploadProjectsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const basePath = '/' + location.pathname.split('/')[1]
  const bulkCreate = useBulkCreateProjects()

  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'projects_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setParseError(null)
    setRows([])

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const parsed = rowsToObjects(parseCSV(text))
        if (parsed.length === 0) {
          setParseError('No data rows found in this CSV.')
          return
        }
        if (!('name' in parsed[0])) {
          setParseError('CSV must include a "name" column header.')
          return
        }
        setRows(parsed.map((r, i) => validateRow(r, i + 2)))
      } catch (err) {
        setParseError('Could not read this file. Please upload a valid CSV.')
      }
    }
    reader.readAsText(file)
  }

  const validRows = rows.filter((r) => !r.error)
  const invalidRows = rows.filter((r) => r.error)

  async function handleImport() {
    if (!profile?.id || validRows.length === 0) return
    try {
      await bulkCreate.mutateAsync({ rows: validRows, ownerId: profile.id })
      navigate(`${basePath}/projects`)
    } catch (err) {
      console.error('Failed to bulk create projects', err)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to={`${basePath}/projects`} className="hover:text-brand-600 transition-colors">Projects</Link>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-medium">Bulk Upload</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Upload Projects</h1>
        <p className="mt-1 text-sm text-gray-500">Upload a CSV to create multiple projects at once</p>
      </div>

      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-900">Need the CSV format?</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Columns: {TEMPLATE_HEADERS.join(', ')}
            </p>
          </div>
          <button type="button" onClick={downloadTemplate} className="btn-secondary inline-flex items-center gap-2 text-sm">
            <Download size={16} />
            Download Template
          </button>
        </div>

        <div>
          <label className="label" htmlFor="csv-file">Upload CSV</label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            className="input-field"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          {fileName && <p className="text-xs text-gray-500 mt-1">Selected: {fileName}</p>}
        </div>

        {parseError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {parseError}
          </div>
        )}

        {bulkCreate.isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            Failed to import projects. Please try again.
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-700 font-medium">{validRows.length} ready to import</span>
              {invalidRows.length > 0 && (
                <span className="text-red-600 font-medium">{invalidRows.length} with errors</span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className={r.error ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2 text-gray-500">{r.rowNumber}</td>
                      <td className="px-4 py-2 text-gray-900">{r.name || '—'}</td>
                      <td className="px-4 py-2">
                        {r.error ? (
                          <span className="text-red-600">{r.error}</span>
                        ) : (
                          <span className="text-green-700">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Link to={`${basePath}/projects`} className="btn-secondary">Cancel</Link>
          <button
            type="button"
            onClick={handleImport}
            disabled={validRows.length === 0 || bulkCreate.isPending}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Upload size={16} />
            {bulkCreate.isPending ? 'Importing...' : `Import ${validRows.length || ''} Project${validRows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
