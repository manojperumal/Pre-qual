import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { MojoLogo } from './MojoLogo'
import clsx from 'clsx'
import {
  LayoutDashboard,
  LogOut,
  User,
  FolderOpen,
  HardHat,
  Wrench,
  FileText,
  Database,
  ClipboardList,
} from 'lucide-react'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

const ROLE_NAV: Record<string, NavItem[]> = {
  owner: [
    { label: 'Dashboard', to: '/owner', icon: <LayoutDashboard size={18} /> },
    { label: 'Projects', to: '/owner/projects', icon: <FolderOpen size={18} /> },
    { label: 'General Contractors', to: '/owner/general-contractors', icon: <HardHat size={18} /> },
    { label: 'Trades', to: '/owner/trades', icon: <Wrench size={18} /> },
    { label: 'Questionnaires', to: '/owner/questionnaires', icon: <FileText size={18} /> },
    { label: 'Question Bank', to: '/owner/question-bank', icon: <Database size={18} /> },
  ],
  gc: [
    { label: 'Dashboard', to: '/gc', icon: <LayoutDashboard size={18} /> },
    { label: 'My Profile', to: '/gc/profile', icon: <User size={18} /> },
    { label: 'Questionnaires', to: '/gc/questionnaires', icon: <FileText size={18} /> },
    { label: 'My Assignments', to: '/gc/assignments', icon: <ClipboardList size={18} /> },
  ],
  trade: [
    { label: 'Dashboard', to: '/trade', icon: <LayoutDashboard size={18} /> },
    { label: 'My Profile', to: '/trade/profile', icon: <User size={18} /> },
    { label: 'My Assignments', to: '/trade/assignments', icon: <ClipboardList size={18} /> },
  ],
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
    <aside className="w-56 flex-shrink-0 bg-[#111827] flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <MojoLogo size="md" subtitle="Pre-qualification" />
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

      {/* Bottom sign out */}
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
  )
}
