import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { BillingMode, Subscription, ProjectSubmissionPayment } from '@/types'

const API_URL = import.meta.env.VITE_API_URL || ''

async function postPayment(path: string, body: Record<string, unknown>): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_URL}/api/payments/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || 'Payment failed')
}

// Charges the one-time per-project fee via a QuickBooks payment token
// (see client/src/lib/quickbooks.ts for how that token is produced).
export function useChargeProjectFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, paymentToken }: { projectId: string; paymentToken: string }) =>
      postPayment('project', { project_id: projectId, payment_token: paymentToken }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submission_payment'] })
    },
  })
}

// Charges the platform-wide annual fee via a QuickBooks payment token.
export function useChargeSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentToken }: { paymentToken: string }) =>
      postPayment('subscription', { payment_token: paymentToken }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

export function useCompanySubscription(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['subscription', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId!)
        .eq('status', 'active')
        .gt('current_period_end', new Date().toISOString())
        .maybeSingle()
      if (error) throw error
      return data as Subscription | null
    },
  })
}

export function useProjectSubmissionPayment(projectId: string | undefined, companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['submission_payment', projectId, companyId],
    enabled: !!projectId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_submission_payments')
        .select('*')
        .eq('project_id', projectId!)
        .eq('company_id', companyId!)
        .maybeSingle()
      if (error) throw error
      return data as ProjectSubmissionPayment | null
    },
  })
}

// Who governs billing for this contractor's company on this project —
// the coordinating GC if one exists, else the project owner (mirrors the
// governing_billing_company() SQL function used to enforce this server-side).
export function useGoverningBillingCompany(projectId: string | undefined, contractorCompanyId: string | null | undefined) {
  return useQuery({
    queryKey: ['governing_billing_company', projectId, contractorCompanyId],
    enabled: !!projectId && !!contractorCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('governing_billing_company', {
        p_project_id: projectId!,
        p_contractor_company_id: contractorCompanyId!,
      })
      if (error) throw error
      if (!data || data === contractorCompanyId) return null
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .select('id, name, billing_mode')
        .eq('id', data)
        .single()
      if (companyErr) throw companyErr
      return company as { id: string; name: string; billing_mode: BillingMode }
    },
  })
}
