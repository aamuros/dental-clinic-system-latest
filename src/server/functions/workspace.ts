import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { hasPermission } from '@/lib/auth/permissions'
import { staffMiddleware } from '@/server/middleware/auth'
import { resolveAuth } from '@/server/services/auth.server'
import type { Workspace } from '@/types/auth'

export const getWorkspaceFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async ({ context }): Promise<Workspace> => {
    if (!hasPermission(context.staff, 'dashboard.read'))
      throw new Error('Access denied.')
    const [clinic, branches] = await Promise.all([
      context.supabase
        .from('clinics')
        .select('id, name, timezone')
        .eq('id', context.staff.clinicId)
        .maybeSingle(),
      context.supabase
        .from('branches')
        .select('id, name')
        .eq('clinic_id', context.staff.clinicId)
        .order('name'),
    ])
    if (clinic.error || branches.error || !clinic.data) {
      // Access can be revoked after middleware authentication but before RLS
      // evaluates the workspace reads. Treat that race as an access change.
      if ((await resolveAuth()).state.status !== 'authenticated')
        throw redirect({ to: '/login' })
      throw new Error('Unable to load the workspace. Please try again.')
    }
    return {
      staff: context.staff,
      clinic: clinic.data,
      branches: branches.data,
    }
  })
