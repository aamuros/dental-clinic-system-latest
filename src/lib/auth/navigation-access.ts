import { redirect } from '@tanstack/react-router'
import { hasPermission } from '@/lib/auth/permissions'
import { modules } from '@/lib/navigation'
import type { ModuleId } from '@/lib/navigation'
import type { StaffAccess } from '@/types/auth'

// Navigation only. Resource endpoints must authorize independently on the server.
export function ensureModuleAccess(staff: StaffAccess, moduleId: ModuleId) {
  const module = modules.find((entry) => entry.id === moduleId)
  if (!module || !hasPermission(staff, module.permission))
    throw redirect({ to: '/access-denied' })
}
