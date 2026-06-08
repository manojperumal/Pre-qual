import { Link, useParams } from 'react-router-dom'
import { useContractorProfile } from '@/hooks/useContractorProfile'
import { ChevronRight, CheckCircle, XCircle, AlertTriangle, HardHat } from 'lucide-react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, company_name, email')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 font-medium">{value ?? <span className="text-gray-400 font-normal">—</span>}</p>
    </div>
  )
}

function ExpiryField({ label, value }: { label: string; value?: string }) {
  const isExpired = value ? new Date(value) < new Date() : false
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium inline-flex items-center gap-1 ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>
        {isExpired && <AlertTriangle size={13} />}
        {value ? format(new Date(value), 'MMM d, yyyy') : <span className="text-gray-400 font-normal">—</span>}
        {isExpired && <span className="text-xs font-normal">(expired)</span>}
      </p>
    </div>
  )
}

function EMRBadge({ value }: { value?: number }) {
  if (value == null) return <span className="text-gray-400 font-normal text-sm">—</span>
  const color = value >= 1.0 ? 'text-red-600 bg-red-50 border-red-200' : value >= 0.85 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-green-600 bg-green-50 border-green-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold border ${color}`}>
      {value >= 1.0 && <AlertTriangle size={12} />}
      {value.toFixed(2)}
      {value >= 1.0 && <span className="text-xs font-normal">high</span>}
    </span>
  )
}

export default function GCProfileViewPage() {
  const { contractorId } = useParams<{ contractorId: string }>()
  const { data: cp, isLoading } = useContractorProfile(contractorId)
  const { data: user } = useProfile(contractorId)

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const displayName = cp?.company_name || user?.company_name || user?.full_name || user?.email || 'GC'

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/owner/general-contractors" className="hover:text-gray-700">General Contractors</Link>
        <ChevronRight size={14} className="text-gray-400" />
        <span className="text-gray-900 font-medium">{displayName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
          <HardHat size={28} className="text-brand-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          {user?.email && <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>}
        </div>
      </div>

      {!cp ? (
        <div className="card p-10 text-center text-gray-500">
          <p className="font-medium">No contractor profile on file</p>
          <p className="text-sm mt-1 text-gray-400">This GC hasn't completed their profile yet.</p>
        </div>
      ) : (
        <>
          {/* Company Info */}
          <Section title="Company Information">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Company Name" value={cp.company_name} />
              <Field label="Trade Type" value={cp.trade_type} />
              <Field label="Years in Business" value={cp.years_in_business} />
              <Field label="Employee Count" value={cp.employee_count} />
              <Field label="License Numbers" value={cp.license_numbers} />
              <Field label="Address" value={[cp.address, cp.city, cp.state, cp.zip].filter(Boolean).join(', ') || undefined} />
            </div>
          </Section>

          {/* General Liability */}
          <Section title="General Liability Insurance">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <Field label="Carrier" value={cp.gl_carrier} />
              <Field label="Policy #" value={cp.gl_policy} />
              <Field label="Limits" value={cp.gl_limits} />
              <ExpiryField label="Expiry" value={cp.gl_expiry} />
            </div>
          </Section>

          {/* Workers Comp */}
          <Section title="Workers Compensation">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <Field label="Carrier" value={cp.wc_carrier} />
              <Field label="Policy #" value={cp.wc_policy} />
              <Field label="Limits" value={cp.wc_limits} />
              <ExpiryField label="Expiry" value={cp.wc_expiry} />
            </div>
          </Section>

          {/* Umbrella */}
          {(cp.umbrella_carrier || cp.umbrella_policy) && (
            <Section title="Umbrella Insurance">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                <Field label="Carrier" value={cp.umbrella_carrier} />
                <Field label="Policy #" value={cp.umbrella_policy} />
                <Field label="Limits" value={cp.umbrella_limits} />
                <ExpiryField label="Expiry" value={cp.umbrella_expiry} />
              </div>
            </Section>
          )}

          {/* Safety Record */}
          <Section title="Safety Record">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-5">
              <div>
                <p className="text-xs text-gray-500 mb-1">EMR</p>
                <EMRBadge value={cp.emr_value} />
              </div>
              <Field label="TRIR" value={cp.trir?.toFixed(2)} />
              <Field label="DART Rate" value={cp.dart_rate?.toFixed(2)} />
            </div>

            {(cp.osha_incidents_y1 != null || cp.osha_incidents_y2 != null) && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">OSHA Recordable Incidents (Y1 = most recent)</p>
                <div className="flex gap-4">
                  {[1, 2, 3, 4, 5].map((y) => {
                    const val = (cp as any)[`osha_incidents_y${y}`]
                    return (
                      <div key={y} className="text-center">
                        <p className="text-xs text-gray-400">Y{y}</p>
                        <p className="text-sm font-semibold text-gray-800">{val ?? '—'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {(cp.total_hours_y1 != null || cp.total_hours_y2 != null) && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">Total Hours Worked (Y1 = most recent)</p>
                <div className="flex gap-6">
                  {[1, 2, 3].map((y) => {
                    const val = (cp as any)[`total_hours_y${y}`]
                    return (
                      <div key={y} className="text-center">
                        <p className="text-xs text-gray-400">Y{y}</p>
                        <p className="text-sm font-semibold text-gray-800">{val?.toLocaleString() ?? '—'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* PTP Program */}
          <Section title="Pre-Task Planning (PTP) Program">
            <div className="flex items-center gap-2 mb-3">
              {cp.has_ptp_program === true
                ? <CheckCircle size={18} className="text-green-500" />
                : cp.has_ptp_program === false
                ? <XCircle size={18} className="text-red-500" />
                : null}
              <span className="text-sm font-medium text-gray-900">
                {cp.has_ptp_program === true ? 'Has PTP Program' : cp.has_ptp_program === false ? 'No PTP Program' : '—'}
              </span>
              {cp.has_ptp_program === false && (
                <span className="ml-2 text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">Risk Flag</span>
              )}
            </div>
            {cp.ptp_description && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{cp.ptp_description}</p>
            )}
          </Section>

          {/* Bonding */}
          <Section title="Bonding">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Bonding Company" value={cp.bonding_company} />
              <Field label="Single Project Limit" value={cp.bonding_single != null ? `$${cp.bonding_single.toLocaleString()}` : undefined} />
              <Field label="Aggregate Limit" value={cp.bonding_aggregate != null ? `$${cp.bonding_aggregate.toLocaleString()}` : undefined} />
            </div>
          </Section>

          {cp.last_updated && (
            <p className="text-xs text-gray-400 text-right">
              Profile last updated {format(new Date(cp.last_updated), 'MMM d, yyyy')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
