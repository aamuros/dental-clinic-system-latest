import { createServerFn } from '@tanstack/react-start'
import { loginSchema } from '@/features/auth/schemas'
import { resolveAuth } from '@/server/services/auth.server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const getAuthStateFn = createServerFn({ method: 'GET' }).handler(
  async () => (await resolveAuth()).state,
)

export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword(data)
    if (error)
      return {
        error:
          'Unable to sign in. Check your credentials or contact your administrator.',
      }
    return { error: null }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw new Error('Unable to sign out. Please try again.')
  return { success: true }
})
