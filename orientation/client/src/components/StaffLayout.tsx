import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { LogOut } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { signOutStaff, staffToken, supabase } from '@/lib/supabase'
import { MojoMark, PageLoader } from './ui'

export interface Staff {
  userId: string
  fullName: string | null
  email: string | null
  companyId: string | null
  companyName: string | null
  companyType: 'owner' | 'gc' | 'trade' | null
  isCompanyAdmin: boolean
  isMojoAdmin: boolean
}

const StaffCtx = createContext<Staff | null>(null)
export const useStaff = () => useContext(StaffCtx)!

export default function StaffLayout() {
  const [staff, setStaff] = useState<Staff | null | false>(null)
  const location = useLocation()

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!(await staffToken())) return alive && setStaff(false)
      try {
        const s = await staffApi.get<Staff>('/me')
        if (alive) setStaff(s)
      } catch {
        if (alive) setStaff(false)
      }
    })()
    const sub = supabase?.auth.onAuthStateChange((evt) => {
      if (evt === 'SIGNED_OUT') setStaff(false)
    })
    return () => {
      alive = false
      sub?.data.subscription.unsubscribe()
    }
  }, [])

  if (staff === null) return <PageLoader />
  if (staff === false) return <Navigate to={`/staff/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />

  const nav: { to: string; label: string; show: boolean }[] = [
    { to: '/staff', label: 'Projects', show: true },
    { to: '/staff/portfolio', label: 'Portfolio', show: staff.companyType === 'owner' || staff.isMojoAdmin },
    { to: '/staff/standard', label: 'Orientation standard', show: staff.companyType === 'owner' },
  ]

  return (
    <StaffCtx.Provider value={staff}>
      <div className="min-h-screen">
        <header className="border-b bg-mojo-dark text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link to="/staff" className="flex items-center gap-2">
              <MojoMark className="text-white" />
              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Orientation</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {nav
                .filter((n) => n.show)
                .map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/staff'}
                    className={({ isActive }) => clsx('rounded px-3 py-1.5', isActive ? 'bg-white/15 font-semibold' : 'text-gray-300 hover:text-white')}
                  >
                    {n.label}
                  </NavLink>
                ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm text-gray-300">
              <span className="hidden sm:inline">
                {staff.fullName || staff.email} · {staff.companyName ?? (staff.isMojoAdmin ? 'Mojo' : '')}
              </span>
              <button
                className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10"
                onClick={async () => {
                  await signOutStaff()
                  window.location.href = '/staff/login'
                }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </StaffCtx.Provider>
  )
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
