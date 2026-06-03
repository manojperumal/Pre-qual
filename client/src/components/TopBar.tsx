import { useAuth } from '@/hooks/useAuth'
import { Bell, Settings, Search } from 'lucide-react'

export function TopBar() {
  const { profile } = useAuth()
  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? 'U'

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
      <button className="text-gray-400 hover:text-white transition-colors">
        <Bell size={18} />
      </button>
      <button className="text-gray-400 hover:text-white transition-colors">
        <Settings size={18} />
      </button>

      {/* Avatar */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
        <div className="hidden sm:block">
          <p className="text-sm text-white font-medium leading-tight">{profile?.full_name || 'User'}</p>
          <p className="text-xs text-gray-400 leading-tight capitalize">{profile?.role}</p>
        </div>
      </div>
    </header>
  )
}
