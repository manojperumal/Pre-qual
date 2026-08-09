import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { BillingMode, Subscription, ProjectSubmissionPayment } from '@/types'

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
