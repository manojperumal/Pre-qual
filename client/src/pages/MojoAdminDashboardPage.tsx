import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useFlaggedResponses } from '@/hooks/useQuestionnaires'
import { Building2, HardHat, Wrench, CreditCard, ClipboardCheck, ArrowRight, Link2 } from 'lucide-react'
import { format } from 'date-fns'

const API_URL = import.meta.env.VITE_API_URL || ''

function QuickBooksConnectionBanner() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = searchParams.get('quickbooks')

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${API_URL}/api/quickbooks/oauth/connect`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to start QuickBooks connection')
      window.location.href = result.url
    } catch (err: any) {
      setError(err?.message || 'Failed to start QuickBooks connection')
      setConnecting(false)
    }
  }

  function dismissStatus() {
    searchParams.delete('quickbooks')
    searchParams.delete('reason')
    setSearchParams(searchParams, { replace: true })
  }

  return (
    <div className="card px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Link2 size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">QuickBooks Billing</p>
          {status === 'connected' && (
            <p className="text-xs text-emerald-600 mt-0.5">Connected successfully.</p>
          )}
          {status === 'error' && (
            <p className="text-xs text-red-600 mt-0.5">
              Connection failed{searchParams.get('reason') ? ` — ${searchParams.get('reason')}` : ''}.
            </p>
          )}
          {!status && (
            <p className="text-xs text-gray-500 mt-0.5">
              Connect Pre-Qual's QuickBooks sandbox company to enable project fee and subscription payments.
            </p>
          )}
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status && (
          <button type="button" onClick={dismissStatus} className="text-xs text-gray-500 hover:text-gray-700">
            Dismiss
          </button>
        )}
        <button type="button" onClick={handleConnect} disabled={connecting} className="btn-secondary text-sm">
          {connecting ? 'Redirecting…' : 'Connect QuickBooks'}
        </button>
      </div>
    </div>
  )
}

function useCompanyCounts() {
  return useQuery({
    queryKey: ['mojo_admin_dashboard_companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, type, name, created_at')
      if (error) throw error
      return data as { id: string; type: string; name: string; created_at: string }[]
    },
  })
}

function useActiveSubscriptionCount() {
  return useQuery({
    queryKey: ['mojo_admin_dashboard_subscriptions'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gt('current_period_end', new Date().toISOString())
      if (error) throw error
      return count ?? 0
    },
  })
}

export default function MojoAdminDashboardPage() {
  const { data: companies = [], isLoading: companiesLoading } = useCompanyCounts()
  const { data: activeSubCount = 0 } = useActiveSubscriptionCount()
  const { data: flagged = [] } = useFlaggedResponses()

  const pendingReview = flagged.filter((f) => !f.mojo_reviewed_at).length
  const owners = companies.filter((c) => c.type === 'owner').length
  const gcs = companies.filter((c) => c.type === 'gc').length
  const trades = companies.filter((c) => c.type === 'trade').length
  const recent = [...companies].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)

  const stats = [
    { label: 'Owners', value: owners, icon: <Building2 size={20} />, color: 'text-brand-600', bg: 'bg-brand-50', to: '/mojo-admin/companies' },
    { label: 'General Contractors', value: gcs, icon: <HardHat size={20} />, color: 'text-indigo-600', bg: 'bg-indigo-50', to: '/mojo-admin/companies' },
    { label: 'Trades', value: trades, icon: <Wrench size={20} />, color: 'text-purple-600', bg: 'bg-purple-50', to: '/mojo-admin/companies' },
    { label: 'Active Subscriptions', value: activeSubCount, icon: <CreditCard size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-50', to: '/mojo-admin/companies' },
    {
      label: 'Pending Mojo Reviews',
      value: pendingReview,
      icon: <ClipboardCheck size={20} />,
      color: pendingReview > 0 ? 'text-amber-600' : 'text-gray-500',
      bg: pendingReview > 0 ? 'bg-amber-50' : 'bg-gray-50',
      to: '/mojo-admin/review-queue',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your clients and pending work</p>
      </div>

      <QuickBooksConnectionBanner />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card px-5 py-4 flex items-center gap-3 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <span className={s.color}>{s.icon}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {pendingReview > 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-5 py-4">
          <p className="text-sm text-amber-800">
            <span className="font-medium">{pendingReview}</span> flagged answer{pendingReview !== 1 ? 's' : ''} waiting for Mojo review.
          </p>
          <Link to="/mojo-admin/review-queue" className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-900">
            Review now
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recently Added Companies</h2>
          <Link to="/mojo-admin/companies" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View all
          </Link>
        </div>
        {companiesLoading ? (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : recent.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">No companies yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map((c) => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400">{format(new Date(c.created_at), 'MMM d, yyyy')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
