import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePrequal, usePrequalDocs, useUpdatePrequalStatus } from '@/hooks/usePrequals'
import { StatusBadge } from '@/components/StatusBadge'
import { PrequalStatus } from '@/types'
import {
  ArrowLeft,
  Building2,
  Shield,
  HardHat,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Edit,
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2">
      <span className="text-xs text-gray-500 uppercase tracking-wider sm:w-44 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value ?? '—'}</span>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <span className="text-brand-600">{icon}</span>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-6 py-4 divide-y divide-gray-100">{children}</div>
    </div>
  )
}

export default function PrequalDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: prequal, isLoading } = usePrequal(id)
  const { data: docs = [] } = usePrequalDocs(id)
  const updateStatus = useUpdatePrequalStatus()

  const isRequester = prequal?.requester_id === profile?.id
  const isApplicant = prequal?.applicant_id === profile?.id
  const roleBase = profile?.role === 'owner' ? '/owner' : profile?.role === 'gc' ? '/gc' : '/trade'

  async function getDocUrl(storagePath: string) {
    const { data } = await supabase.storage
      .from('prequal-documents')
      .createSignedUrl(storagePath, 60 * 5) // 5-min signed URL
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function handleStatusChange(status: PrequalStatus) {
    if (!id) return
    updateStatus.mutate({ id, status })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (!prequal) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Pre-qualification not found.</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4">
          Go Back
        </button>
      </div>
    )
  }

  const applicant = prequal.applicant as { company_name?: string; full_name?: string; email?: string } | null
  const requester = prequal.requester as { company_name?: string; full_name?: string } | null

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {isApplicant && prequal.status === 'draft' && (
          <Link
            to={`${roleBase}/prequal/${prequal.id}/edit`}
            className="btn-secondary text-sm"
          >
            <Edit size={14} className="mr-1" />
            Edit
          </Link>
        )}
      </div>

      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {prequal.company_name || applicant?.company_name || 'Pre-Qualification'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Submitted {format(new Date(prequal.updated_at), 'MMMM d, yyyy')}
            {requester?.company_name && ` · For ${requester.company_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={prequal.status} />
        </div>
      </div>

      {/* Requester actions */}
      {isRequester && (prequal.status === 'submitted' || prequal.status === 'under_review') && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm font-medium text-yellow-800 mb-3">Review Actions</p>
          <div className="flex flex-wrap gap-2">
            {prequal.status === 'submitted' && (
              <button
                onClick={() => handleStatusChange('under_review')}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-100 rounded-md hover:bg-yellow-200 transition-colors"
              >
                <RefreshCw size={14} />
                Mark Under Review
              </button>
            )}
            <button
              onClick={() => handleStatusChange('approved')}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} />
              Approve
            </button>
            <button
              onClick={() => handleStatusChange('rejected')}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors disabled:opacity-50"
            >
              <XCircle size={14} />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Company Info */}
      <Section title="Company Information & Licenses" icon={<Building2 size={18} />}>
        <InfoRow label="Company Name" value={prequal.company_name} />
        <InfoRow label="Address" value={prequal.address} />
        <InfoRow label="State" value={prequal.state} />
        <InfoRow label="Years in Business" value={prequal.years_in_business} />
        <InfoRow label="Trade Type / Specialty" value={prequal.trade_type} />
        <InfoRow label="License Numbers" value={prequal.license_numbers} />
        {applicant && (
          <>
            <InfoRow label="Contact Name" value={applicant.full_name} />
            <InfoRow label="Contact Email" value={applicant.email} />
          </>
        )}
      </Section>

      {/* Section 2: Insurance */}
      <Section title="Insurance Certificates" icon={<Shield size={18} />}>
        <div className="py-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            General Liability
          </p>
          <div className="pl-3 border-l-2 border-brand-200 space-y-0.5">
            <InfoRow label="Carrier" value={prequal.gl_carrier} />
            <InfoRow label="Policy #" value={prequal.gl_policy} />
            <InfoRow label="Limits" value={prequal.gl_limits} />
            <InfoRow
              label="Expiry"
              value={prequal.gl_expiry ? format(new Date(prequal.gl_expiry), 'MMM d, yyyy') : null}
            />
          </div>
        </div>
        <div className="py-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Workers' Compensation
          </p>
          <div className="pl-3 border-l-2 border-brand-200 space-y-0.5">
            <InfoRow label="Carrier" value={prequal.wc_carrier} />
            <InfoRow label="Policy #" value={prequal.wc_policy} />
            <InfoRow label="Limits" value={prequal.wc_limits} />
            <InfoRow
              label="Expiry"
              value={prequal.wc_expiry ? format(new Date(prequal.wc_expiry), 'MMM d, yyyy') : null}
            />
          </div>
        </div>
        {prequal.umbrella_carrier && (
          <div className="py-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Umbrella / Excess
            </p>
            <div className="pl-3 border-l-2 border-brand-200 space-y-0.5">
              <InfoRow label="Carrier" value={prequal.umbrella_carrier} />
              <InfoRow label="Policy #" value={prequal.umbrella_policy} />
              <InfoRow label="Limits" value={prequal.umbrella_limits} />
              <InfoRow
                label="Expiry"
                value={
                  prequal.umbrella_expiry
                    ? format(new Date(prequal.umbrella_expiry), 'MMM d, yyyy')
                    : null
                }
              />
            </div>
          </div>
        )}
      </Section>

      {/* Section 3: Safety */}
      <Section title="Safety Record (EMR)" icon={<HardHat size={18} />}>
        <InfoRow label="EMR Value" value={prequal.emr_value} />
        <InfoRow label="TRIR" value={prequal.trir} />
        <InfoRow
          label={`OSHA 300 (${new Date().getFullYear() - 1})`}
          value={prequal.osha_year1}
        />
        <InfoRow
          label={`OSHA 300 (${new Date().getFullYear() - 2})`}
          value={prequal.osha_year2}
        />
        <InfoRow
          label={`OSHA 300 (${new Date().getFullYear() - 3})`}
          value={prequal.osha_year3}
        />
        <InfoRow label="Safety Program" value={prequal.safety_program} />
      </Section>

      {/* Section 4: Financial */}
      <Section title="Financial & Bonding" icon={<DollarSign size={18} />}>
        <InfoRow
          label="Annual Revenue"
          value={
            prequal.annual_revenue
              ? `$${prequal.annual_revenue.toLocaleString()}`
              : null
          }
        />
        <InfoRow
          label="Single Project Bond"
          value={
            prequal.bonding_single
              ? `$${prequal.bonding_single.toLocaleString()}`
              : null
          }
        />
        <InfoRow
          label="Aggregate Bond"
          value={
            prequal.bonding_aggregate
              ? `$${prequal.bonding_aggregate.toLocaleString()}`
              : null
          }
        />
        <InfoRow label="Bonding Company" value={prequal.bonding_company} />
      </Section>

      {/* Documents */}
      {docs.length > 0 && (
        <Section title="Uploaded Documents" icon={<FileText size={18} />}>
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{doc.file_name}</p>
                  <p className="text-xs text-gray-400 capitalize">{doc.doc_type} document</p>
                </div>
              </div>
              <button
                onClick={() => getDocUrl(doc.storage_path)}
                className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                <ExternalLink size={14} />
                View
              </button>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}
