// TODO: replace with real data — these are placeholder datasets for the
// dashboard charts until the underlying queries/reporting tables exist.

export const submissionTrend = [
  { month: 'May', submitted: 14, approved: 9 },
  { month: 'Jun', submitted: 18, approved: 13 },
  { month: 'Jul', submitted: 22, approved: 16 },
  { month: 'Aug', submitted: 19, approved: 15 },
  { month: 'Sep', submitted: 27, approved: 21 },
  { month: 'Oct', submitted: 31, approved: 24 },
]

export const projectsByStatus = [
  { status: 'Active', count: 12 },
  { status: 'Onboarding', count: 5 },
  { status: 'At Risk', count: 3 },
  { status: 'Closed', count: 8 },
]

export const complianceBreakdown = [
  { name: 'Compliant', value: 68, color: '#10b981' },
  { name: 'Needs Attention', value: 21, color: '#f59e0b' },
  { name: 'Non-Compliant', value: 11, color: '#ef4444' },
]

// Shared by GC/Trade dashboards
export const contractorSubmissionTrend = [
  { month: 'May', submitted: 2, approved: 1 },
  { month: 'Jun', submitted: 3, approved: 2 },
  { month: 'Jul', submitted: 4, approved: 3 },
  { month: 'Aug', submitted: 3, approved: 3 },
  { month: 'Sep', submitted: 5, approved: 4 },
  { month: 'Oct', submitted: 6, approved: 5 },
]

export const submissionStatusBreakdown = [
  { name: 'Approved', value: 58, color: '#10b981' },
  { name: 'Under Review', value: 24, color: '#f59e0b' },
  { name: 'Needs Info', value: 12, color: '#f97316' },
  { name: 'Rejected', value: 6, color: '#ef4444' },
]

export const questionnaireProgress = [
  { status: 'Pending', count: 3 },
  { status: 'In Progress', count: 2 },
  { status: 'Submitted', count: 4 },
  { status: 'Approved', count: 7 },
]
