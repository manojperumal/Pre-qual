import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { roleLabel } from '@/lib/roleLabels'

export function UserMenu() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const effectiveRole = profile?.company_type ?? profile?.role
  const basePath = effectiveRole === 'owner' ? '/owner' : effectiveRole === 'gc' ? '/gc' : '/trade'
  const profilePath = effectiveRole === 'owner' ? `${basePath}/settings` : `${basePath}/profile`
  const profileLabel = effectiveRole === 'owner' ? 'Settings' : 'My Profile'

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? 'U'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm text-white font-medium leading-tight">{profile?.full_name || 'User'}</p>
          <p className="text-xs text-gray-400 leading-tight">{roleLabel(profile?.role)}</p>
        </div>
        <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          <button
            onClick={() => {
              setOpen(false)
              navigate(profilePath)
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
          >
            <User size={14} />
            {profileLabel}
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
