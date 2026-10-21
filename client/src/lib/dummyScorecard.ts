// TODO: replace with real data — placeholder datasets for the Safety
// Scorecard page until the underlying tracking data (PTP submissions,
// observations, kudos, WPS, responsiveness logs) is wired up.

export interface SubcontractorScore {
  company: string
  safety: number
  ptp: number
  observation: number
  kudos: number
  wps: number
  responsiveness: number
}

export const subcontractors: SubcontractorScore[] = [
  { company: 'Apex Electrical', safety: 86, ptp: 22, observation: 91, kudos: 0.4, wps: 100, responsiveness: 81 },
  { company: 'Summit Concrete', safety: 55, ptp: 18, observation: 76, kudos: 0.1, wps: 94, responsiveness: 46 },
  { company: 'Ironclad Steel', safety: 41, ptp: 12, observation: 58, kudos: 0.0, wps: 88, responsiveness: 38 },
  { company: 'Blue Ridge Plumbing', safety: 63, ptp: 29, observation: 84, kudos: 0.6, wps: 100, responsiveness: 52 },
  { company: 'Vertex Mechanical', safety: 48, ptp: 15, observation: 67, kudos: 0.2, wps: 92, responsiveness: 34 },
]

export const safetyScore = 54
export const ptpScore = 35
export const observationScore = 94.1
export const responsivenessScore = 38
export const kudosScore = 0.3
export const wpsScore = 100

export const monthlyTrend = [
  { month: 'May', safety: 48, ptp: 28, observation: 88, responsiveness: 30, kudos: 0.1, wps: 96 },
  { month: 'Jun', safety: 51, ptp: 31, observation: 90, responsiveness: 33, kudos: 0.2, wps: 97 },
  { month: 'Jul', safety: 58, ptp: 33, observation: 92, responsiveness: 41, kudos: 0.2, wps: 99 },
  { month: 'Aug', safety: 52, ptp: 30, observation: 91, responsiveness: 36, kudos: 0.3, wps: 98 },
  { month: 'Sep', safety: 56, ptp: 37, observation: 95, responsiveness: 40, kudos: 0.3, wps: 100 },
  { month: 'Oct', safety: 54, ptp: 35, observation: 94, responsiveness: 38, kudos: 0.3, wps: 100 },
]

export function scoreColorClasses(value: number, max = 100) {
  const pct = (value / max) * 100
  if (pct >= 75) return 'bg-emerald-100 text-emerald-800'
  if (pct >= 45) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export function gaugeColor(value: number, max = 100) {
  const pct = (value / max) * 100
  if (pct >= 75) return '#10b981'
  if (pct >= 45) return '#f59e0b'
  return '#ef4444'
}
