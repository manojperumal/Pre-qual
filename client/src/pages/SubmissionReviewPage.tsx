import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ProjectSubmission, SubmissionDocument } from '@/types'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 min-w-[160px]">{label}:</span>
      <span className="text-gray-900">{String(value)}</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-1 mb-2">{label}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

export default function SubmissionReviewPage() {
  const { projectId, submissionId } = useParams<{ projectId: string; submissionId: string }>()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')

  const role = profile?.role ?? 'owner'
  const dashPath = role === 'gc' ? `/gc/projects/${projectId}` : `/owner/projects/${projectId}`

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission_detail', submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_submissions')
        .select('*, contractor:profiles!contractor_id(full_name, company_name, email)')
        .eq('id', submissionId!)
        .single()
      if (error) throw error
      return data as ProjectSubmission & { contractor: { full_name: string; company_name: string; email: string } }
    },
  })

  const { data: documents = [] } = useQuery({
    queryKey: ['submission_documents', submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submission_documents')
        .select('*')
        .eq('submission_id', submissionId!)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data as SubmissionDocument[]
    },
  })

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from('project_submissions')
        .update({
          status: newStatus,
          reviewer_notes: notes || undefined,
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submission_detail', submissionId] })
      qc.invalidateQueries({ queryKey: ['project_submissions', projectId] })
      setUpdateMsg('Status updated successfully')
      setTimeout(() => setUpdateMsg(''), 3000)
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (!submission) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Submission not found.</p>
        <Link to={dashPath} className="text-brand-600 underline mt-2 inline-block">Back</Link>
      </div>
    )
  }

  const snap = (submission.snapshot ?? {}) as Record<string, unknown>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to={dashPath} className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to Project
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Submission Review</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[submission.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {submission.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Risk flags */}
      {(submission.flagged_no_ptp || submission.flagged_high_emr) && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
            <AlertTriangle size={16} />
            Risk Flags
          </div>
          {submission.flagged_no_ptp && (
            <p className="text-sm text-red-700">No PTP Program on file</p>
          )}
          {submission.flagged_high_emr && (
            <p className="text-sm text-red-700">High EMR (above 1.0)</p>
          )}
        </div>
      )}

      {/* Contractor info */}
      <div className="card p-6 space-y-1">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Contractor</h2>
        <Field label="Name" value={submission.contractor?.full_name} />
        <Field label="Company" value={submission.contractor?.company_name} />
        <Field label="Email" value={submission.contractor?.email} />
        <Field label="Submitted" value={format(new Date(submission.updated_at), 'MMM d, yyyy h:mm a')} />
      </div>

      {/* Snapshot data */}
      {Object.keys(snap).length > 0 && (
        <div className="card p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Profile Data</h2>

          <Section label="Company">
            <Field label="Company Name" value={snap.company_name as string} />
            <Field label="Trade Type" value={snap.trade_type as string} />
            <Field label="Address" value={snap.address as string} />
            <Field label="City" value={snap.city as string} />
            <Field label="State" value={snap.state as string} />
            <Field label="ZIP" value={snap.zip as string} />
            <Field label="Years in Business" value={snap.years_in_business as number} />
            <Field label="Employees" value={snap.employee_count as number} />
            <Field label="License #" value={snap.license_numbers as string} />
          </Section>

          <Section label="Insurance">
            <Field label="GL Carrier" value={snap.gl_carrier as string} />
            <Field label="GL Policy" value={snap.gl_policy as string} />
            <Field label="GL Limits" value={snap.gl_limits as string} />
            <Field label="GL Expiry" value={snap.gl_expiry as string} />
            <Field label="WC Carrier" value={snap.wc_carrier as string} />
            <Field label="WC Policy" value={snap.wc_policy as string} />
            <Field label="WC Limits" value={snap.wc_limits as string} />
            <Field label="WC Expiry" value={snap.wc_expiry as string} />
            <Field label="Umbrella Carrier" value={snap.umbrella_carrier as string} />
            <Field label="Umbrella Policy" value={snap.umbrella_policy as string} />
            <Field label="Umbrella Limits" value={snap.umbrella_limits as string} />
            <Field label="Umbrella Expiry" value={snap.umbrella_expiry as string} />
          </Section>

          <Section label="Safety">
            <Field label="EMR" value={snap.emr_value as number} />
            <Field label="TRIR" value={snap.trir as number} />
            <Field label="DART Rate" value={snap.dart_rate as number} />
            <Field label="OSHA Incidents Y1" value={snap.osha_incidents_y1 as number} />
            <Field label="OSHA Incidents Y2" value={snap.osha_incidents_y2 as number} />
            <Field label="OSHA Incidents Y3" value={snap.osha_incidents_y3 as number} />
            <Field label="OSHA Incidents Y4" value={snap.osha_incidents_y4 as number} />
            <Field label="OSHA Incidents Y5" value={snap.osha_incidents_y5 as number} />
            <Field label="Total Hours Y1" value={snap.total_hours_y1 as number} />
            <Field label="Total Hours Y2" value={snap.total_hours_y2 as number} />
            <Field label="Total Hours Y3" value={snap.total_hours_y3 as number} />
          </Section>

          <Section label="PTP Program">
            <Field label="Has PTP Program" value={(snap.has_ptp_program as boolean) ? 'Yes' : 'No'} />
            <Field label="Description" value={snap.ptp_description as string} />
          </Section>

          <Section label="Bonding">
            <Field label="Bonding Company" value={snap.bonding_company as string} />
            <Field label="Single Limit" value={snap.bonding_single != null ? `$${(snap.bonding_single as number).toLocaleString()}` : undefined} />
            <Field label="Aggregate Limit" value={snap.bonding_aggregate != null ? `$${(snap.bonding_aggregate as number).toLocaleString()}` : undefined} />
          </Section>
        </div>
      )}

      {/* Documents */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents uploaded.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 text-sm">
                <CheckCircle size={14} className="text-green-500" />
                <span className="text-gray-700">{doc.file_name}</span>
                <span className="text-gray-400 text-xs">({doc.doc_type})</span>
                <span className="text-gray-400 text-xs ml-auto">
                  {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Review actions */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Review Decision</h2>
        <div>
          <label className="label">Reviewer Notes</label>
          <textarea
            className="input-field min-h-[80px]"
            placeholder="Add notes for the contractor..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {updateMsg && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            {updateMsg}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateStatus.mutate('approved')}
            disabled={updateStatus.isPending}
            className="btn-primary bg-green-600 hover:bg-green-700"
          >
            Approve
          </button>
          <button
            onClick={() => updateStatus.mutate('needs_more_info')}
            disabled={updateStatus.isPending}
            className="btn-secondary text-orange-700 border-orange-300 hover:bg-orange-50"
          >
            Request More Info
          </button>
          <button
            onClick={() => updateStatus.mutate('rejected')}
            disabled={updateStatus.isPending}
            className="btn-secondary text-red-700 border-red-300 hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}
