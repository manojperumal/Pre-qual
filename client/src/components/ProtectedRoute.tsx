import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (profile) {
    // Use company_type if available, fall back to role during transition
    const effectiveRole = profile.company_type ?? profile.role

    if (!allowedRoles.includes(effectiveRole)) {
      if (profile.is_mojo_admin) return <Navigate to="/mojo-admin" replace />
      if (effectiveRole === 'owner') return <Navigate to="/owner" replace />
      if (effectiveRole === 'gc') return <Navigate to="/gc" replace />
      return <Navigate to="/trade" replace />
    }
  }

  return <>{children}</>
}
