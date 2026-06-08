import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────

export type AnswerType = 'radio_yes_no' | 'multi_select' | 'document_upload' | 'text_area' | 'number'
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
  created_at: string
}

export interface Questionnaire {
  id: string
  created_by: string
  name: string
  description: string | null
  is_template: boolean
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
  project_id: string
  assignee_id: string
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
  assignee?: { full_name: string | null; company_name: string | null; email: string | null; role: string }
  assigner?: { full_name: string | null; company_name: string | null }
}

export interface Response {
  id: string
  assignment_id: string
  question_id: string
  answer_text: string | null
  answer_options: string[] | null
  document_path: string | null
  document_name: string | null
  created_at: string
  updated_at: string
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

// ─── Questionnaires ───────────────────────────────────────────────────────

// companyOwnerId: pass the company owner's ID for team members so they see company questionnaires
export function useQuestionnaires(createdBy: string | undefined, companyOwnerId?: string) {
  const effectiveId = companyOwnerId || createdBy
  return useQuery({
    queryKey: ['questionnaires', effectiveId],
    enabled: !!effectiveId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaires')
        .select('*')
        .eq('created_by', effectiveId!)
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
        .select('*, questionnaire:questionnaires(id,name), assignee:profiles!assignee_id(full_name,company_name,email,role), assigner:profiles!assigned_by(full_name,company_name)')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Assignment[]
    },
  })
}

export function useMyAssignments(assigneeId: string | undefined) {
  return useQuery({
    queryKey: ['assignments', 'mine', assigneeId],
    enabled: !!assigneeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('*, questionnaire:questionnaires(id,name), project:projects(id,name), assigner:profiles!assigned_by(full_name,company_name)')
        .eq('assignee_id', assigneeId!)
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

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: {
      questionnaire_id: string
      project_id: string
      assignee_id: string
      assigned_by: string
      due_date?: string
    }) => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .insert({ ...a, due_date: a.due_date || null })
        .select()
        .single()
      if (error) throw error
      return data as Assignment
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['assignments', 'project', vars.project_id] })
    },
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
    }: {
      id: string
      status: AssignmentStatus
      reviewerNotes?: string
      reviewedBy?: string
    }) => {
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .update({
          status,
          reviewer_notes: reviewerNotes || null,
          reviewed_by: reviewedBy || null,
          reviewed_at: new Date().toISOString(),
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
