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
