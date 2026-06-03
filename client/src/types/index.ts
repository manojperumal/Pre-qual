export type UserRole = 'owner' | 'gc' | 'trade'

export type PrequalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'

export type InvitationStatus = 'pending' | 'accepted' | 'expired'

export type DocType = 'coi' | 'safety' | 'financial'

export interface Profile {
  id: string
  role: UserRole
  company_name: string | null
  full_name: string | null
  email: string | null
  created_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  owner_id: string
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  joined_at: string
  profile?: Profile
}

export interface Prequalification {
  id: string
  applicant_id: string
  requester_id: string
  status: PrequalStatus
  // company info
  company_name: string | null
  address: string | null
  years_in_business: number | null
  trade_type: string | null
  license_numbers: string | null
  state: string | null
  // insurance
  gl_carrier: string | null
  gl_policy: string | null
  gl_limits: string | null
  gl_expiry: string | null
  wc_carrier: string | null
  wc_policy: string | null
  wc_limits: string | null
  wc_expiry: string | null
  umbrella_carrier: string | null
  umbrella_policy: string | null
  umbrella_limits: string | null
  umbrella_expiry: string | null
  // safety
  emr_value: number | null
  osha_year1: number | null
  osha_year2: number | null
  osha_year3: number | null
  trir: number | null
  safety_program: string | null
  // financial
  annual_revenue: number | null
  bonding_single: number | null
  bonding_aggregate: number | null
  bonding_company: string | null
  // meta
  created_at: string
  updated_at: string
}

export interface PrequalificationWithProfile extends Prequalification {
  applicant?: Profile
  requester?: Profile
}

export interface PrequalDocument {
  id: string
  prequalification_id: string
  doc_type: DocType
  file_name: string
  storage_path: string
  uploaded_at: string
}

export interface Invitation {
  id: string
  sender_id: string
  recipient_email: string
  recipient_role: 'gc' | 'trade'
  status: InvitationStatus
  prequalification_id: string | null
  project_id?: string
  token?: string
  expires_at?: string
  created_at: string
}

export interface InvitationWithSender extends Invitation {
  sender?: Profile
}

// Form data types
export interface CompanyInfoFormData {
  company_name: string
  address: string
  years_in_business: number
  trade_type: string
  license_numbers: string
  state: string
}

export interface InsuranceFormData {
  gl_carrier: string
  gl_policy: string
  gl_limits: string
  gl_expiry: string
  wc_carrier: string
  wc_policy: string
  wc_limits: string
  wc_expiry: string
  umbrella_carrier?: string
  umbrella_policy?: string
  umbrella_limits?: string
  umbrella_expiry?: string
}

export interface SafetyFormData {
  emr_value: number
  osha_year1: number
  osha_year2: number
  osha_year3: number
  trir: number
  safety_program: string
}

export interface FinancialFormData {
  annual_revenue: number
  bonding_single: number
  bonding_aggregate: number
  bonding_company: string
}

export type PrequalFormData = CompanyInfoFormData &
  InsuranceFormData &
  SafetyFormData &
  FinancialFormData

// Phase 1B types

export interface ContractorProfile {
  id: string
  user_id: string
  // Company
  company_name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  trade_type?: string
  years_in_business?: number
  license_numbers?: string
  employee_count?: number
  // Insurance
  gl_carrier?: string
  gl_policy?: string
  gl_limits?: string
  gl_expiry?: string
  wc_carrier?: string
  wc_policy?: string
  wc_limits?: string
  wc_expiry?: string
  umbrella_carrier?: string
  umbrella_policy?: string
  umbrella_limits?: string
  umbrella_expiry?: string
  // Safety
  emr_value?: number
  osha_incidents_y1?: number
  osha_incidents_y2?: number
  osha_incidents_y3?: number
  osha_incidents_y4?: number
  osha_incidents_y5?: number
  total_hours_y1?: number
  total_hours_y2?: number
  total_hours_y3?: number
  trir?: number
  dart_rate?: number
  // PTP
  has_ptp_program?: boolean
  ptp_description?: string
  // Bonding
  bonding_company?: string
  bonding_single?: number
  bonding_aggregate?: number
  last_updated?: string
  created_at?: string
}

export interface ProjectSubmission {
  id: string
  project_id: string
  contractor_id: string
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_more_info'
  snapshot?: Record<string, unknown>
  reviewer_notes?: string
  reviewed_by?: string
  reviewed_at?: string
  flagged_no_ptp?: boolean
  flagged_high_emr?: boolean
  created_at: string
  updated_at: string
}

export interface SubmissionDocument {
  id: string
  submission_id: string
  doc_type: 'coi' | 'osha_300' | 'osha_301' | 'osha_citations' | 'loss_runs' | 'ptp_photos' | 'other'
  file_name: string
  storage_path: string
  uploaded_at: string
}
