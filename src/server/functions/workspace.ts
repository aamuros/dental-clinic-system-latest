import { createServerFn } from '@tanstack/react-start'
import { hasPermission } from '@/lib/auth/permissions'
import { staffMiddleware } from '@/server/middleware/auth'
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
        .single(),
      context.supabase
        .from('branches')
        .select('id, name')
        .eq('clinic_id', context.staff.clinicId)
        .order('name'),
    ])
    if (clinic.error || branches.error)
      throw new Error('Unable to load the workspace. Please try again.')
    return {
      staff: context.staff,
      clinic: clinic.data,
      branches: branches.data,
    }
  })
