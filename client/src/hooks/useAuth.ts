import { useEffect, useState, useCallback } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Company, Profile } from '@/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  company: Company | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    company: null,
    loading: true,
  })

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, company:companies!new_company_id(*)')
      .eq('id', userId)
      .single()
    const profile = data as Profile | null
    const company = (data as any)?.company as Company | null
    return { profile, company }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      if (session?.user) {
        const { profile, company } = await fetchProfile(session.user.id)
        setState({ session, user: session.user, profile, company, loading: false })
      } else {
        setState({ session: null, user: null, profile: null, company: null, loading: false })
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      if (session?.user) {
        const { profile, company } = await fetchProfile(session.user.id)
        setState({ session, user: session.user, profile, company, loading: false })
      } else {
        setState({ session: null, user: null, profile: null, company: null, loading: false })
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return { ...state, signOut }
}
