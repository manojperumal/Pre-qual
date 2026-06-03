import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { ProjectSubmission, SubmissionDocument } from '@/types'
import { AlertTriangle, CheckCircle, ChevronRight, FileText, ThumbsUp, MessageSquare, XCircle } from 'lucide-react'
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
    <div className="flex gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 min-w-[160px] flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{String(value)}</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{label}</h3>
      <div>{children}</div>
    </div>
  )
}

export default function SubmissionReviewPage() {
  const { projectId, submissionId } = useParams<{ projectId: string; submissionId: string }>()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: projects = [] } = useProjects(profile?.id)
  const project = projects.find((p) => p.id === projectId)

  const role = profile?.role ?? 'owner'
  const projectPath = role === 'gc' ? `/gc/projects/${projectId}` : `/owner/projects/${projectId}`

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
          reviewer_notes: notes || null,
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submission_detail', submissionId] })
      qc.invalidateQueries({ queryKey: ['project_submissions', projectId] })
      qc.invalidateQueries({ queryKey: ['owner_pending_submissions'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
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
        <Link to={projectPath} className="text-brand-600 underline mt-2 inline-block">Back</Link>
      </div>
    )
  }

  const snap = (submission.snapshot ?? {}) as Record<string, unknown>
  const isDecided = ['approved', 'rejected'].includes(submission.status)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
        <Link to={`/${role}/projects`} className="hover:text-brand-600">Projects</Link>
        <ChevronRight size={14} className="text-gray-400" />
        <Link to={projectPath} className="hover:text-brand-600">{project?.name ?? 'Project'}</Link>
        <ChevronRight size={14} className="text-gray-400" />
        <span className="text-gray-900 font-medium">
          {submission.contractor?.full_name || submission.contractor?.company_name || 'Review'}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pre-Qual Review</h1>
          <p className="mt-1 text-sm text-gray-500">
            {submission.contractor?.company_name || submission.contractor?.full_name || '—'}
            {' · '}
            {project?.name}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium flex-shrink-0 ${STATUS_COLORS[submission.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {submission.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Risk flags */}
      {(submission.flagged_no_ptp || submission.flagged_high_emr) && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
            <AlertTriangle size={16} />
            Risk Flags
          </div>
          {submission.flagged_no_ptp && <p className="text-sm text-red-700 ml-6">No PTP Program on file</p>}
          {submission.flagged_high_emr && <p className="text-sm text-red-700 ml-6">High EMR (above 1.0)</p>}
        </div>
      )}

      {/* Contractor */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Contractor</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><span className="text-gray-500">Name:</span> <span className="ml-2 text-gray-900 font-medium">{submission.contractor?.full_name || '—'}</span></div>
          <div><span className="text-gray-500">Company:</span> <span className="ml-2 text-gray-900 font-medium">{submission.contractor?.company_name || '—'}</span></div>
          <div><span className="text-gray-500">Email:</span> <span className="ml-2 text-gray-900">{submission.contractor?.email || '—'}</span></div>
          <div><span className="text-gray-500">Submitted:</span> <span className="ml-2 text-gray-900">{format(new Date(submission.updated_at), 'MMM d, yyyy h:mm a')}</span></div>
        </div>
        {submission.reviewer_notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Previous Reviewer Notes</p>
            <p className="text-sm text-gray-700">{submission.reviewer_notes}</p>
          </div>
        )}
      </div>

      {/* Profile snapshot */}
      {Object.keys(snap).length > 0 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Profile Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section label="Company">
              <Field label="Company Name" value={snap.company_name as string} />
              <Field label="Trade Type" value={snap.trade_type as string} />
              <Field label="Years in Business" value={snap.years_in_business as number} />
              <Field label="Employees" value={snap.employee_count as number} />
              <Field label="License #" value={snap.license_numbers as string} />
              <Field label="Address" value={[snap.city, snap.state, snap.zip].filter(Boolean).join(', ')} />
            </Section>

            <Section label="Safety">
              <Field label="EMR" value={snap.emr_value as number} />
              <Field label="TRIR" value={snap.trir as number} />
              <Field label="DART Rate" value={snap.dart_rate as number} />
              <Field label="OSHA Y1–Y5" value={[snap.osha_incidents_y1, snap.osha_incidents_y2, snap.osha_incidents_y3, snap.osha_incidents_y4, snap.osha_incidents_y5].filter((v) => v != null).join(', ')} />
              <Field label="PTP Program" value={(snap.has_ptp_program as boolean) ? 'Yes' : 'No'} />
              {snap.ptp_description && <Field label="PTP Description" value={snap.ptp_description as string} />}
            </Section>

            <Section label="Insurance">
              <Field label="GL" value={`${snap.gl_carrier ?? ''} / ${snap.gl_limits ?? ''} / exp ${snap.gl_expiry ?? ''}`} />
              <Field label="WC" value={`${snap.wc_carrier ?? ''} / ${snap.wc_limits ?? ''} / exp ${snap.wc_expiry ?? ''}`} />
              {snap.umbrella_carrier && <Field label="Umbrella" value={`${snap.umbrella_carrier} / ${snap.umbrella_limits ?? ''} / exp ${snap.umbrella_expiry ?? ''}`} />}
            </Section>

            <Section label="Bonding">
              <Field label="Company" value={snap.bonding_company as string} />
              <Field label="Single Limit" value={snap.bonding_single != null ? `$${(snap.bonding_single as number).toLocaleString()}` : null} />
              <Field label="Aggregate" value={snap.bonding_aggregate != null ? `$${(snap.bonding_aggregate as number).toLocaleString()}` : null} />
            </Section>
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FileText size={16} className="text-gray-400" />
          Documents
        </h2>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-400">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-2.5 text-sm">
                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                <span className="text-gray-800 font-medium flex-1">{doc.file_name}</span>
                <span className="text-gray-400 text-xs uppercase">{doc.doc_type.replace(/_/g, ' ')}</span>
                <span className="text-gray-400 text-xs">{format(new Date(doc.uploaded_at), 'MMM d')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Review decision */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Review Decision</h2>

        {saved && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Decision saved successfully.
          </div>
        )}

        {isDecided && (
          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            This submission has been <strong>{submission.status}</strong>. You can still change the decision below.
          </div>
        )}

        <div>
          <label className="label">Reviewer Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea
            className="input-field min-h-[80px]"
            placeholder="Add notes for the contractor…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateStatus.mutate('approved')}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
          >
            <ThumbsUp size={15} />
            Approve
          </button>
          <button
            onClick={() => updateStatus.mutate('needs_more_info')}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors disabled:opacity-50"
          >
            <MessageSquare size={15} />
            Request More Info
          </button>
          <button
            onClick={() => updateStatus.mutate('rejected')}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <XCircle size={15} />
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}
