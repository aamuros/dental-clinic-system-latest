import { createBrowserClient } from '@supabase/ssr'
import { requirePublicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

export function getBrowserSupabaseClient() {
  const env = requirePublicEnv()
  return createBrowserClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  )
}
