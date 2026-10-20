import '@tanstack/react-start/server-only'
import { assertPermission } from '@/lib/auth/permissions'
import type { AccessScope, Permission } from '@/lib/auth/permissions'
import type { StaffAccess } from '@/types/auth'

// Call with a freshly resolved staff context and a server-derived resource scope.
// RLS must independently enforce the same scope on the database operation.
export function authorize(
  staff: StaffAccess | null,
  permission: Permission,
  scope: AccessScope,
) {
  assertPermission(staff, permission, scope)
  return staff
}
