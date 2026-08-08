import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getImpersonationState, endImpersonation } from '@/lib/impersonation'
import { Eye, LogOut } from 'lucide-react'

export function ImpersonationBanner() {
  const navigate = useNavigate()
  const [state, setState] = useState(getImpersonationState())

  useEffect(() => {
    setState(getImpersonationState())
  }, [])

  if (!state) return null

  async function handleExit() {
    await endImpersonation()
    navigate('/mojo-admin', { replace: true })
  }

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-medium">
      <span className="inline-flex items-center gap-2">
        <Eye size={16} />
        Viewing as: {state.companyName}
      </span>
      <button onClick={handleExit} className="inline-flex items-center gap-1.5 hover:underline">
        <LogOut size={14} />
        Exit
      </button>
    </div>
  )
}
