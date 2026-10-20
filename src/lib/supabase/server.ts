import '@tanstack/react-start/server-only'
import { createServerClient } from '@supabase/ssr'
import {
  getCookies,
  getRequest,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { requirePublicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

// A fresh client per request is essential with concurrent Vercel Functions.
export function createServerSupabaseClient() {
  const env = requirePublicEnv()
  setResponseHeader('Cache-Control', 'private, no-store')
  return createServerClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: new URL(getRequest().url).protocol === 'https:',
      },
      cookies: {
        getAll: () =>
          Object.entries(getCookies()).map(([name, value]) => ({
            name,
            value,
          })),
        setAll(cookies, headers) {
          for (const { name, value, options } of cookies)
            setCookie(name, value, options)
          for (const [name, value] of Object.entries(headers))
            setResponseHeader(name, value)
        },
      },
    },
  )
}
