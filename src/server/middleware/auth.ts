import { createMiddleware } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { resolveAuth } from '@/server/services/auth.server'

export const staffMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const { state, supabase } = await resolveAuth()
    if (state.status !== 'authenticated' || !supabase)
      throw redirect({ to: '/login' })
    return next({ context: { staff: state.staff, supabase } })
  },
)
