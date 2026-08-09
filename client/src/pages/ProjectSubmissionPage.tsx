import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  useContractorProfile,
  useProjectSubmission,
  useUpsertSubmission,
} from '@/hooks/useContractorProfile'
import { supabase } from '@/lib/supabase'
import {
  useGoverningBillingCompany,
  useCompanySubscription,
  useProjectSubmissionPayment,
  useCreateProjectCheckout,
  useCreateSubscriptionCheckout,
} from '@/hooks/useBilling'
import { SubmissionDocument } from '@/types'
import { Upload, AlertTriangle, CheckCircle, CreditCard } from 'lucide-react'
import { format } from 'date-fns'

const DOC_TYPES: { key: SubmissionDocument['doc_type']; label: string; ptpOnly?: boolean }[] = [
  { key: 'coi', label: 'Certificate of Insurance (COI)' },
  { key: 'osha_300', label: 'OSHA 300 Log' },
  { key: 'osha_301', label: 'OSHA 301 Log' },
  { key: 'osha_citations', label: 'OSHA Citations' },
  { key: 'loss_runs', label: '5-Year Loss Runs' },
  { key: 'ptp_photos', label: 'PTP Photos', ptpOnly: true },
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_more_info: 'Needs More Info',
}

function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 min-w-[140px]">{label}:</span>
      <span>{String(value)}</span>
    </div>
  )
}

export default function ProjectSubmissionPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: contractorProfile, isLoading: profileLoading } = useContractorProfile(profile?.id)
  const { data: submission, isLoading: subLoading } = useProjectSubmission(projectId, profile?.id)
  const upsert = useUpsertSubmission()

  const companyId = profile?.new_company_id ?? null
  const { data: governingCompany } = useGoverningBillingCompany(projectId, companyId)
  const { data: activeSubscription } = useCompanySubscription(companyId)
  const { data: submissionPayment } = useProjectSubmissionPayment(projectId, companyId)
  const createProjectCheckout = useCreateProjectCheckout()
  const createSubscriptionCheckout = useCreateSubscriptionCheckout()

  const paymentRequired = governingCompany?.billing_mode === 'platform_only'
  const hasPaid = !!activeSubscription || submissionPayment?.status === 'paid'
  const blockedByPayment = paymentRequired && !hasPaid

  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)

  // Coming back from Stripe Checkout
  useEffect(() => {
    const paymentResult = searchParams.get('payment')
    if (!paymentResult) return
    if (paymentResult === 'success') {
      setPaymentNotice('Payment received — it may take a few seconds to reflect below.')
      qc.invalidateQueries({ queryKey: ['submission_payment'] })
      qc.invalidateQueries({ queryKey: ['subscription'] })
    } else if (paymentResult === 'cancelled') {
      setPaymentNotice('Checkout was cancelled — no charge was made.')
    }
    searchParams.delete('payment')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dashPath = profile?.role === 'gc' ? '/gc' : '/trade'
  const profilePath = profile?.role === 'gc' ? '/gc/profile' : '/trade/profile'

  const isProfileComplete = contractorProfile &&
    contractorProfile.company_name &&
    contractorProfile.gl_carrier

  async function handleSaveDraft() {
    if (!projectId || !profile?.id || !contractorProfile) return
    await upsert.mutateAsync({
      project_id: projectId,
      contractor_id: profile.id,
      status: 'draft',
      snapshot: contractorProfile as unknown as Record<string, unknown>,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSubmit() {
    if (!projectId || !profile?.id || !contractorProfile || blockedByPayment) return
    setSubmitError(null)
    try {
      await upsert.mutateAsync({
        project_id: projectId,
        contractor_id: profile.id,
        status: 'submitted',
        snapshot: contractorProfile as unknown as Record<string, unknown>,
        flagged_no_ptp: !contractorProfile.has_ptp_program,
        flagged_high_emr: contractorProfile.emr_value != null && contractorProfile.emr_value > 1.0,
      })
      navigate(dashPath)
    } catch (err: any) {
      setSubmitError(err?.message || 'Payment required before this can be submitted.')
    }
  }

  async function handleUpload(docType: SubmissionDocument['doc_type'], file: File) {
    if (!submission?.id && !projectId) return
    setUploading(docType)
    try {
      const submissionId = submission?.id ?? 'pending'
      const path = `${submissionId}/${docType}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('prequal-documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      if (submission?.id) {
        await supabase.from('submission_documents').insert({
          submission_id: submission.id,
          doc_type: docType,
          file_name: file.name,
          storage_path: path,
        })
      }
      setUploadedDocs((prev) => ({ ...prev, [docType]: file.name }))
    } finally {
      setUploading(null)
    }
  }

  if (profileLoading || subLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to={dashPath} className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Submit Pre-Qualification</h1>
        <p className="text-sm text-gray-500 mt-1">Project ID: {projectId}</p>
      </div>

      {/* Current status */}
      {submission && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <CheckCircle size={16} />
          Current status: <strong>{STATUS_LABELS[submission.status] ?? submission.status}</strong>
          {submission.updated_at && (
            <span className="ml-auto text-blue-600">
              Updated {format(new Date(submission.updated_at), 'MMM d, yyyy')}
            </span>
          )}
        </div>
      )}

      {paymentNotice && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <CheckCircle size={16} />
          {paymentNotice}
        </div>
      )}

      {/* Payment required warning */}
      {blockedByPayment && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <CreditCard size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 flex-1">
            <p className="font-medium">Payment required before you can submit</p>
            <p>
              {governingCompany?.name ?? 'This project'} requires payment for pre-qualification processing —
              a one-time fee for this project, or a platform-wide annual subscription covering every project.
            </p>
            {createProjectCheckout.isError && (
              <p className="text-red-600 mt-1">{(createProjectCheckout.error as Error).message}</p>
            )}
            {createSubscriptionCheckout.isError && (
              <p className="text-red-600 mt-1">{(createSubscriptionCheckout.error as Error).message}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => projectId && createProjectCheckout.mutate(projectId)}
                disabled={createProjectCheckout.isPending || createSubscriptionCheckout.isPending}
                className="btn-primary text-xs py-1.5 px-3"
              >
                {createProjectCheckout.isPending ? 'Redirecting…' : 'Pay $150 for this project'}
              </button>
              <button
                type="button"
                onClick={() => createSubscriptionCheckout.mutate()}
                disabled={createProjectCheckout.isPending || createSubscriptionCheckout.isPending}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {createSubscriptionCheckout.isPending ? 'Redirecting…' : 'Subscribe annually — $450/yr'}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{submitError}</p>
        </div>
      )}

      {/* Profile incomplete warning */}
      {!isProfileComplete && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Your profile is incomplete.</p>
            <p>Please complete your contractor profile before submitting.</p>
            <Link to={profilePath} className="underline font-medium mt-1 inline-block">
              Complete Profile
            </Link>
          </div>
        </div>
      )}

      {/* Profile summary */}
      {contractorProfile && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Profile Summary</h2>
            <Link to={profilePath} className="text-sm text-brand-600 hover:text-brand-700">Edit Profile</Link>
          </div>

          <ProfileSection label="Company">
            <Field label="Company" value={contractorProfile.company_name} />
            <Field label="Trade Type" value={contractorProfile.trade_type} />
            <Field label="Address" value={[contractorProfile.address, contractorProfile.city, contractorProfile.state, contractorProfile.zip].filter(Boolean).join(', ')} />
            <Field label="Years in Business" value={contractorProfile.years_in_business} />
            <Field label="Employees" value={contractorProfile.employee_count} />
            <Field label="License #" value={contractorProfile.license_numbers} />
          </ProfileSection>

          <ProfileSection label="Insurance">
            <Field label="GL Carrier" value={contractorProfile.gl_carrier} />
            <Field label="GL Policy" value={contractorProfile.gl_policy} />
            <Field label="GL Limits" value={contractorProfile.gl_limits} />
            <Field label="GL Expiry" value={contractorProfile.gl_expiry} />
            <Field label="WC Carrier" value={contractorProfile.wc_carrier} />
            <Field label="WC Policy" value={contractorProfile.wc_policy} />
            <Field label="WC Limits" value={contractorProfile.wc_limits} />
            <Field label="WC Expiry" value={contractorProfile.wc_expiry} />
            {contractorProfile.umbrella_carrier && (
              <>
                <Field label="Umbrella Carrier" value={contractorProfile.umbrella_carrier} />
                <Field label="Umbrella Limits" value={contractorProfile.umbrella_limits} />
                <Field label="Umbrella Expiry" value={contractorProfile.umbrella_expiry} />
              </>
            )}
          </ProfileSection>

          <ProfileSection label="Safety">
            <Field label="EMR" value={contractorProfile.emr_value} />
            <Field label="TRIR" value={contractorProfile.trir} />
            <Field label="DART Rate" value={contractorProfile.dart_rate} />
            <Field label="OSHA Incidents Y1" value={contractorProfile.osha_incidents_y1} />
            <Field label="OSHA Incidents Y2" value={contractorProfile.osha_incidents_y2} />
            <Field label="OSHA Incidents Y3" value={contractorProfile.osha_incidents_y3} />
          </ProfileSection>

          <ProfileSection label="PTP Program">
            <Field label="Has PTP Program" value={contractorProfile.has_ptp_program ? 'Yes' : 'No'} />
            {contractorProfile.has_ptp_program && (
              <Field label="Description" value={contractorProfile.ptp_description} />
            )}
          </ProfileSection>

          <ProfileSection label="Bonding">
            <Field label="Bonding Company" value={contractorProfile.bonding_company} />
            <Field label="Single Limit" value={contractorProfile.bonding_single != null ? `$${contractorProfile.bonding_single.toLocaleString()}` : undefined} />
            <Field label="Aggregate Limit" value={contractorProfile.bonding_aggregate != null ? `$${contractorProfile.bonding_aggregate.toLocaleString()}` : undefined} />
          </ProfileSection>
        </div>
      )}

      {/* Document upload */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Documents</h2>
        <div className="space-y-3">
          {DOC_TYPES.filter((d) => !d.ptpOnly || contractorProfile?.has_ptp_program).map((doc) => (
            <div key={doc.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700">{doc.label}</span>
              <div className="flex items-center gap-2">
                {uploadedDocs[doc.key] && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle size={12} />
                    {uploadedDocs[doc.key]}
                  </span>
                )}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading === doc.key}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(doc.key, file)
                    }}
                  />
                  <span className="inline-flex items-center gap-1 text-xs btn-secondary py-1 px-2">
                    <Upload size={12} />
                    {uploading === doc.key ? 'Uploading...' : 'Upload'}
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
          <CheckCircle size={16} />
          Draft saved
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={handleSaveDraft}
          disabled={!contractorProfile || upsert.isPending}
          className="btn-secondary"
        >
          Save Draft
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isProfileComplete || upsert.isPending || blockedByPayment || submission?.status === 'submitted' || submission?.status === 'approved'}
          className="btn-primary"
          title={blockedByPayment ? 'Payment required before submitting' : undefined}
        >
          {upsert.isPending ? 'Submitting...' : 'Submit for Review'}
        </button>
      </div>
    </div>
  )
}
