import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'
import {
  LayoutDashboard,
  LogOut,
  User,
} from 'lucide-react'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

const ROLE_NAV: Record<string, NavItem[]> = {
  owner: [
    { label: 'Dashboard', to: '/owner', icon: <LayoutDashboard size={18} /> },
  ],
  gc: [
    { label: 'Dashboard', to: '/gc', icon: <LayoutDashboard size={18} /> },
    { label: 'My Profile', to: '/gc/profile', icon: <User size={18} /> },
  ],
  trade: [
    { label: 'Dashboard', to: '/trade', icon: <LayoutDashboard size={18} /> },
    { label: 'My Profile', to: '/trade/profile', icon: <User size={18} /> },
  ],
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  gc: 'General Contractor',
  trade: 'Trade',
}

function getInitials(name?: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? 'owner'
  const navItems = ROLE_NAV[role] ?? ROLE_NAV.owner

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-brand-800 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-white font-black text-xl">mojo</span>
        <span className="text-brand-500 font-medium text-xl"> pre-qual</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to.split('/').length === 2}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom user section */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md mb-2">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {getInitials(profile?.full_name)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {profile?.full_name || 'User'}
            </p>
            <p className="text-white/50 text-xs truncate">{profile?.email}</p>
          </div>
        </div>
        {/* Role badge */}
        <div className="px-2 mb-2">
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
