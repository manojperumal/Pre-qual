import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { BillingMode, Subscription, ProjectSubmissionPayment } from '@/types'

const API_URL = import.meta.env.VITE_API_URL || ''

async function postCheckout(path: string, body: Record<string, unknown>): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_URL}/api/checkout/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || 'Failed to start checkout')
  return result.url as string
}

// Redirects the browser to Stripe Checkout for the one-time per-project fee.
export function useCreateProjectCheckout() {
  return useMutation({
    mutationFn: async (projectId: string) => postCheckout('project', { project_id: projectId, return_url: window.location.href }),
    onSuccess: (url) => {
      window.location.href = url
    },
  })
}

// Redirects the browser to Stripe Checkout for the platform-wide annual subscription.
export function useCreateSubscriptionCheckout() {
  return useMutation({
    mutationFn: async () => postCheckout('subscription', { return_url: window.location.href }),
    onSuccess: (url) => {
      window.location.href = url
    },
  })
}

export function useUpdateBillingMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ companyId, billingMode }: { companyId: string; billingMode: BillingMode }) => {
      const { error } = await supabase.from('companies').update({ billing_mode: billingMode }).eq('id', companyId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
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
