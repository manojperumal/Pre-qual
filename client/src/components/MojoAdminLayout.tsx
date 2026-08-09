import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { MojoLogo } from './MojoLogo'
import clsx from 'clsx'
import { LayoutDashboard, Building2, ShieldCheck, ClipboardCheck, LogOut } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/mojo-admin', icon: <LayoutDashboard size={18} /> },
  { label: 'Companies', to: '/mojo-admin/companies', icon: <Building2 size={18} /> },
  { label: 'Global Question Bank', to: '/mojo-admin/questions', icon: <ShieldCheck size={18} /> },
  { label: 'Review Queue', to: '/mojo-admin/review-queue', icon: <ClipboardCheck size={18} /> },
]

export function MojoAdminLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-[#F3F4F6]">
      <aside className="w-56 flex-shrink-0 bg-[#111827] flex flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <MojoLogo size="md" subtitle="Mojo Admin" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/mojo-admin'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/15 border-l-2 border-[#E8336D] text-white pl-2'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
