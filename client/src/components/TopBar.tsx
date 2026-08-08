import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Settings, Search } from 'lucide-react'
import { NotificationsMenu } from './NotificationsMenu'
import { UserMenu } from './UserMenu'

export function TopBar() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const effectiveRole = profile?.company_type ?? profile?.role
  const basePath = effectiveRole === 'owner' ? '/owner' : effectiveRole === 'gc' ? '/gc' : '/trade'
  // Owner has no settings/profile destination yet — only GC/Trade have one
  const hasSettingsPage = effectiveRole === 'gc' || effectiveRole === 'trade'

  return (
    <header className="h-14 bg-[#111827] border-b border-white/10 flex items-center px-6 gap-4 flex-shrink-0">
      {/* Search */}
      <div className="flex items-center gap-2 bg-white/10 rounded-md px-3 py-1.5 flex-1 max-w-sm">
        <Search size={14} className="text-gray-400" />
        <input
          type="text"
          placeholder="Type to Search"
          className="bg-transparent text-sm text-white placeholder-gray-400 outline-none w-full"
        />
      </div>

      <div className="flex-1" />

      {/* Icons */}
      <NotificationsMenu />
      {hasSettingsPage && (
        <button
          onClick={() => navigate(`${basePath}/profile`)}
          className="text-gray-400 hover:text-white transition-colors"
          title="My Profile"
        >
          <Settings size={18} />
        </button>
      )}

      <UserMenu />
    </header>
  )
}
