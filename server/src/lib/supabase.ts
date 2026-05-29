import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    '[server] Missing Supabase env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
  )
}

// Server-side client uses the service role key (bypasses RLS for admin ops)
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
