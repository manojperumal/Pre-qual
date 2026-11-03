export type Status =
  | 'not_started'
  | 'in_progress'
  | 'refresh_required'
  | 'pending_verification'
  | 'cleared'
  | 'expired'
  | 'revoked'
  | 'suspended'

export const STATUS_ORDER: Status[] = [
  'cleared',
  'pending_verification',
  'in_progress',
  'not_started',
  'refresh_required',
  'expired',
  'suspended',
  'revoked',
]

export const STATUS_LABEL: Record<Status, { en: string; es: string }> = {
  not_started: { en: 'Not started', es: 'Sin empezar' },
  in_progress: { en: 'In progress', es: 'En progreso' },
  refresh_required: { en: 'Refresh required', es: 'Actualización requerida' },
  pending_verification: { en: 'Photo check at gate', es: 'Verificación de foto en la entrada' },
  cleared: { en: 'Cleared', es: 'Autorizado' },
  expired: { en: 'Expired', es: 'Vencido' },
  revoked: { en: 'Revoked', es: 'Revocado' },
  suspended: { en: 'Suspended', es: 'Suspendido' },
}

export const STATUS_STYLE: Record<Status, string> = {
  cleared: 'bg-green-100 text-green-800 border-green-300',
  pending_verification: 'bg-amber-100 text-amber-900 border-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  not_started: 'bg-gray-100 text-gray-700 border-gray-300',
  refresh_required: 'bg-orange-100 text-orange-900 border-orange-300',
  expired: 'bg-red-100 text-red-800 border-red-300',
  suspended: 'bg-red-100 text-red-800 border-red-300',
  revoked: 'bg-red-100 text-red-800 border-red-300',
}

export const isBlocked = (s: Status) => s !== 'cleared'

export const REVOKE_CATEGORY_LABEL: Record<string, string> = {
  safety_violation: 'Safety violation',
  identity_mismatch: 'Identity mismatch',
  incident: 'Incident under review',
  left_project: 'Left the project',
  other: 'Other',
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—')
export const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—')
