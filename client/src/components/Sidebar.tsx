import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'
import {
  LayoutDashboard,
  FileText,
  Send,
  LogOut,
  HardHat,
  Building2,
  Wrench,
} from 'lucide-react'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

const ROLE_NAV: Record<string, NavItem[]> = {
  owner: [
    { label: 'Dashboard', to: '/owner', icon: <LayoutDashboard size={18} /> },
    { label: 'Send Invite', to: '/owner/invite', icon: <Send size={18} /> },
  ],
  gc: [
    { label: 'Dashboard', to: '/gc', icon: <LayoutDashboard size={18} /> },
    { label: 'New Pre-Qual', to: '/gc/prequal/new', icon: <FileText size={18} /> },
    { label: 'Send Invite', to: '/gc/invite', icon: <Send size={18} /> },
  ],
  trade: [
    { label: 'Dashboard', to: '/trade', icon: <LayoutDashboard size={18} /> },
    { label: 'New Pre-Qual', to: '/trade/prequal/new', icon: <FileText size={18} /> },
  ],
}

const ROLE_ICON: Record<string, React.ReactNode> = {
  owner: <Building2 size={22} className="text-brand-400" />,
  gc: <HardHat size={22} className="text-brand-400" />,
  trade: <Wrench size={22} className="text-brand-400" />,
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  gc: 'General Contractor',
  trade: 'Trade',
}

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? 'trade'
  const navItems = ROLE_NAV[role] ?? []

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <HardHat size={24} className="text-brand-400" />
          <span className="text-white font-bold text-lg">PreQual Pro</span>
        </div>
      </div>

      {/* Role indicator */}
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center gap-2 text-gray-300">
          {ROLE_ICON[role]}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Role</p>
            <p className="text-sm font-medium">{ROLE_LABEL[role]}</p>
          </div>
        </div>
        {profile?.company_name && (
          <p className="mt-1 text-xs text-gray-400 truncate">{profile.company_name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/owner' || item.to === '/gc' || item.to === '/trade'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-700 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User + Sign out */}
      <div className="px-4 py-4 border-t border-gray-700">
        <div className="mb-3 px-3">
          <p className="text-sm font-medium text-white truncate">
            {profile?.full_name || 'User'}
          </p>
          <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
