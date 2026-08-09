import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────

export type AnswerType = 'radio_yes_no' | 'radio_yes_no_comments' | 'multi_select' | 'document_upload' | 'text_area' | 'number'
export type QuestionCategory = 'company_info' | 'insurance' | 'safety' | 'ptp' | 'bonding' | 'loss_runs' | 'compliance'
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'needs_more_info'

export interface Question {
  id: string
  created_by: string | null
  category: QuestionCategory
  question_text: string
  answer_type: AnswerType
  options: string[] | null
  hint: string | null
  is_global: boolean
  is_required: boolean
  requires_mojo_review: boolean
  created_at: string
}

export interface Questionnaire {
  id: string
  created_by: string | null
  name: string
  description: string | null
  is_template: boolean
  is_global: boolean
  created_at: string
  updated_at: string
}

export interface QuestionnaireQuestion {
  id: string
  questionnaire_id: string
  question_id: string
  order_index: number
  is_required: boolean
  question?: Question
}

export interface Assignment {
  id: string
  questionnaire_id: string
  project_id: string | null
  company_id: string | null
  rule_id: string | null
  is_exempt: boolean
  assignee_id: string | null
  assigned_by: string
  due_date: string | null
  status: AssignmentStatus
  reviewer_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  questionnaire?: Questionnaire
  project?: { id: string; name: string }
  company?: { id: string; name: string }
  assignee?: { full_name: string | null; company_name: string | null; email: string | null; role: string }
  assigner?: { full_name: string | null; company_name: string | null }
}

export interface AssignmentRule {
  id: string
  questionnaire_id: string
  project_id: string
  assigned_by: string
  due_date: string | null
  created_at: string
}

export interface Response {
  id: string
  assignment_id: string
  question_id: string
  answer_text: string | null
  answer_options: string[] | null
  document_path: string | null
  document_name: string | null
  company_comments: string | null
  mojo_feedback: string | null
  mojo_reviewed_at: string | null
  mojo_reviewed_by: string | null
  ai_suggested: boolean
  created_at: string
  updated_at: string
}

export interface FlaggedResponse extends Response {
  question: { question_text: string; category: QuestionCategory; requires_mojo_review: boolean }
  assignment: {
    id: string
    status: AssignmentStatus
    project: { name: string } | null
    company: { name: string } | null
    assignee: { full_name: string | null; email: string | null } | null
    questionnaire: { name: string } | null
  }
}

// ─── Question Bank ────────────────────────────────────────────────────────

export function useQuestionBank(createdBy?: string) {
  return useQuery({
    queryKey: ['question_bank', createdBy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('question_bank')
        .select('*')
        .order('category')
        .order('created_at')
      if (error) throw error
      return data as Question[]
    },
  })
}

export function useCreateQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (q: {
      category: QuestionCategory
      question_text: string
      answer_type: AnswerType
      options?: string[]
      hint?: string
      is_required?: boolean
      requires_mojo_review?: boolean
      created_by: string
    }) => {
      const { data, error } = await supabase
        .from('question_bank')
        .insert({ ...q, is_global: false })
        .select()
        .single()
      if (error) throw error
      return data as Question
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['question_bank'] }),
  })
}

export function useDeleteQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('question_bank').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['question_bank'] }),
  })
}

export function useUpdateQuestionMojoReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, requiresMojoReview }: { id: string; requiresMojoReview: boolean }) => {
      const { error } = await supabase
        .from('question_bank')
        .update({ requires_mojo_review: requiresMojoReview })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['question_bank'] }),
  })
}

// ─── Questionnaires ───────────────────────────────────────────────────────

// RLS scopes rows to: global questionnaires, your own, or any questionnaire
// created by someone else in your company (see migration 020) — no need to
// filter by a specific creator id here.
export function useQuestionnaires(userId: string | undefined) {
  return useQuery({
    queryKey: ['questionnaires', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaires')
        .select('*')
        .order('is_global', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Questionnaire[]
    },
  })
}

export function useQuestionnaire(id: string | undefined) {
  return useQuery({
    queryKey: ['questionnaire', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaires')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Questionnaire
    },
  })
}

export function useQuestionnaireQuestions(questionnaireId: string | undefined) {
  return useQuery({
    queryKey: ['questionnaire_questions', questionnaireId],
    enabled: !!questionnaireId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_questions')
        .select('*, question:question_bank(*)')
        .eq('questionnaire_id', questionnaireId!)
        .order('order_index')
      if (error) throw error
      return data as QuestionnaireQuestion[]
    },
  })
}

export function useCreateQuestionnaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (q: { name: string; description?: string; created_by: string; is_template?: boolean }) => {
      const { data, error } = await supabase
        .from('questionnaires')
        .insert({ name: q.name, description: q.description || null, created_by: q.created_by, is_template: q.is_template ?? true })
        .select()
        .single()
      if (error) throw error
      return data as Questionnaire
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questionnaires'] }),
  })
}

export function useUpdateQuestionnaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('questionnaires')
        .update({ name, description: description || null })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Questionnaire
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['questionnaires'] })
      qc.invalidateQueries({ queryKey: ['questionnaire', id] })
    },
  })
}

export function useDeleteQuestionnaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('questionnaires').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questionnaires'] }),
  })
}

export function useSaveQuestionnaireQuestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ questionnaireId, questionIds }: { questionnaireId: string; questionIds: string[] }) => {
      // Replace all questions for this questionnaire
      await supabase.from('questionnaire_questions').delete().eq('questionnaire_id', questionnaireId)
      if (questionIds.length === 0) return
      const rows = questionIds.map((qid, i) => ({
        questionnaire_id: questionnaireId,
        question_id: qid,
        order_index: i,
        is_required: true,
      }))
      const { error } = await supabase.from('questionnaire_questions').insert(rows)
      if (error) throw error
    },
    onSuccess: (_, { questionnaireId }) => {
      qc.invalidateQueries({ queryKey: ['questionnaire_questions', questionnaireId] })
    },
  })
}

// ─── Assignments ──────────────────────────────────────────────────────────

export function useProjectAssignments(projectId: string | undefined) {
  return useQuery({
    queryKey: ['assignments', 'project', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('*, questionnaire:questionnaires(id,name), company:companies(id,name), assignee:profiles!assignee_id(full_name,company_name,email,role), assigner:profiles!assigned_by(full_name,company_name)')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Assignment[]
    },
  })
}

// Company-shared: any admin/contributor at the company sees assignments made
// to their company, plus (for backward compat) any legacy row still
// pointed at them individually via assignee_id.
export function useMyAssignments(userId: string | undefined, companyId?: string | null) {
  return useQuery({
    queryKey: ['assignments', 'mine', userId, companyId],
    enabled: !!userId,
    queryFn: async () => {
      const filter = companyId
        ? `assignee_id.eq.${userId},company_id.eq.${companyId}`
        : `assignee_id.eq.${userId}`
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('*, questionnaire:questionnaires(id,name), project:projects(id,name), company:companies(id,name), assigner:profiles!assigned_by(full_name,company_name)')
        .or(filter)
        .eq('is_exempt', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Assignment[]
    },
  })
}

export function useAssignment(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['assignment', assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('*, questionnaire:questionnaires(id,name), project:projects(id,name), assignee:profiles!assignee_id(full_name,company_name,email,role), assigner:profiles!assigned_by(full_name,company_name)')
        .eq('id', assignmentId!)
        .single()
      if (error) throw error
      return data as Assignment
    },
  })
}

// Direct assignment to one company — project_id optional (omit for "applies
// across all projects with this company"). assignee_id is no longer set up
// front; whoever at the company actually opens/submits it is stamped later.
export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: {
      questionnaire_id: string
      company_id: string
      assigned_by: string
      project_id?: string
      due_date?: string
    }) => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .insert({ ...a, project_id: a.project_id || null, due_date: a.due_date || null })
        .select()
        .single()
      if (error) throw error
      return data as Assignment
    },
    onSuccess: (_, vars) => {
      if (vars.project_id) qc.invalidateQueries({ queryKey: ['assignments', 'project', vars.project_id] })
      qc.invalidateQueries({ queryKey: ['assignments', 'mine'] })
    },
  })
}

// "Whole project" rule — fans out into one instance per company via a
// database trigger (including companies that join the project later).
export function useCreateAssignmentRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: {
      questionnaire_id: string
      project_id: string
      assigned_by: string
      due_date?: string
    }) => {
      const { data, error } = await supabase
        .from('questionnaire_assignment_rules')
        .insert({ ...r, due_date: r.due_date || null })
        .select()
        .single()
      if (error) throw error
      return data as AssignmentRule
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['assignments', 'project', vars.project_id] })
      qc.invalidateQueries({ queryKey: ['assignments', 'mine'] })
    },
  })
}

// Exempt one company from a project-wide rule's auto-generated instance,
// without touching any other assignment (e.g. a direct one) they have.
export function useExemptAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('questionnaire_assignments')
        .update({ is_exempt: true })
        .eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  })
}

export function useUpdateAssignmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reviewerNotes,
      reviewedBy,
      assigneeId,
    }: {
      id: string
      status: AssignmentStatus
      reviewerNotes?: string
      reviewedBy?: string
      /** Stamps who at the company actually did the work — company-shared assignments aren't pre-tied to one person. */
      assigneeId?: string
    }) => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .update({
          status,
          reviewer_notes: reviewerNotes || null,
          reviewed_by: reviewedBy || null,
          reviewed_at: new Date().toISOString(),
          ...(assigneeId ? { assignee_id: assigneeId } : {}),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Assignment
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['assignment', data.id] })
      qc.invalidateQueries({ queryKey: ['assignments'] })
    },
  })
}

// ─── Responses ────────────────────────────────────────────────────────────

export function useAssignmentResponses(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['responses', assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_responses')
        .select('*')
        .eq('assignment_id', assignmentId!)
      if (error) throw error
      return data as Response[]
    },
  })
}

// ─── Mojo review queue ──────────────────────────────────────────────────

export function useFlaggedResponses() {
  return useQuery({
    queryKey: ['flagged_responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_responses')
        .select(
          '*, question:question_bank!inner(question_text, category, requires_mojo_review), assignment:questionnaire_assignments(id, status, project:projects(name), company:companies(name), assignee:profiles!assignee_id(full_name, email), questionnaire:questionnaires(name))'
        )
        .eq('question.requires_mojo_review', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as FlaggedResponse[]
    },
  })
}

export function useMarkResponseMojoReviewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      reviewedBy,
      feedback,
      reviewed,
    }: {
      id: string
      reviewedBy: string
      feedback?: string
      /** false re-opens a previously reviewed response */
      reviewed: boolean
    }) => {
      const { error } = await supabase
        .from('questionnaire_responses')
        .update({
          mojo_reviewed_at: reviewed ? new Date().toISOString() : null,
          mojo_reviewed_by: reviewed ? reviewedBy : null,
          ...(feedback !== undefined ? { mojo_feedback: feedback || null } : {}),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flagged_responses'] }),
  })
}

export function useAICompleteQuestionnaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      assignmentId,
      documentPaths,
    }: {
      assignmentId: string
      documentPaths: Array<{ path: string; type: string; name: string }>
    }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${apiUrl}/api/questionnaires/${assignmentId}/ai-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ document_paths: documentPaths }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || 'AI completion failed')
      }
      return res.json()
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['responses', vars.assignmentId] })
      qc.invalidateQueries({ queryKey: ['assignment', vars.assignmentId] })
    },
  })
}

export function useUpsertResponse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: {
      assignment_id: string
      question_id: string
      answer_text?: string | null
      answer_options?: string[] | null
      document_path?: string | null
      document_name?: string | null
      company_comments?: string | null
      mojo_feedback?: string | null
    }) => {
      const { data, error } = await supabase
        .from('questionnaire_responses')
        .upsert(r, { onConflict: 'assignment_id,question_id' })
        .select()
        .single()
      if (error) throw error
      return data as Response
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['responses', data.assignment_id] })
    },
  })
}
