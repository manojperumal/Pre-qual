import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { startImpersonation } from '@/lib/impersonation'
import { useAuth } from '@/hooks/useAuth'
import { Company } from '@/types'
import { Building2, HardHat, Wrench, Search, LogIn, LogOut } from 'lucide-react'
import { MojoLogo } from '@/components/MojoLogo'

const API_URL = import.meta.env.VITE_API_URL || ''

const TYPE_ICON: Record<string, React.ReactNode> = {
  owner: <Building2 size={16} />,
  gc: <HardHat size={16} />,
  trade: <Wrench size={16} />,
}

const TYPE_LABEL: Record<string, string> = {
  owner: 'Owner',
  gc: 'General Contractor',
  trade: 'Trade',
}

function useCompanies() {
  return useQuery({
    queryKey: ['mojo_admin_companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('name', { ascending: true })
      if (error) throw error
      return data as Company[]
    },
  })
}

export default function MojoAdminCompaniesPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: companies = [], isLoading } = useCompanies()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = companies.filter((c) => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function handleViewAs(company: Company) {
    setError(null)
    setImpersonatingId(company.id)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${API_URL}/api/admin/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ company_id: company.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to view as this company')

      await startImpersonation({
        hashedToken: body.hashed_token,
        companyId: company.id,
        companyName: company.name,
        companyType: company.type,
      })

      const basePath = company.type === 'owner' ? '/owner' : company.type === 'gc' ? '/gc' : '/trade'
      navigate(basePath, { replace: true })
    } catch (err: any) {
      setError(err.message || 'Failed to view as this company')
      setImpersonatingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <MojoLogo size="md" subtitle="Mojo Admin" />
        <button
          onClick={async () => {
            await signOut()
            navigate('/login')
          }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            View any company's account exactly as their admin sees it. Actions you take will be attributed to that company's admin.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field sm:w-56"
          >
            <option value="all">All types</option>
            <option value="owner">Owners</option>
            <option value="gc">General Contractors</option>
            <option value="trade">Trades</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center text-gray-500">
            <p className="font-medium">No companies found</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Company', 'Type', 'Created', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        {TYPE_ICON[c.type]}
                        {TYPE_LABEL[c.type] ?? c.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleViewAs(c)}
                        disabled={impersonatingId === c.id}
                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                      >
                        <LogIn size={12} />
                        {impersonatingId === c.id ? 'Loading…' : 'View as Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
