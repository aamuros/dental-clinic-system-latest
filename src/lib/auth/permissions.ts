import type { StaffAccess, StaffRole } from '@/types/auth'

export const roleLabels: Record<StaffRole, string> = {
  administrator: 'Administrator',
  dentist: 'Dentist',
  dental_assistant: 'Dental Assistant',
  receptionist: 'Receptionist',
  billing_staff: 'Billing Staff',
}

export const permissions = [
  'dashboard.read',
  'patients.read',
  'patients.write',
  'patients.branches.manage',
  'appointments.read',
  'clinical.read',
  'clinical.write',
  'billing.read',
  'inventory.read',
  'staff.read',
  'reports.read',
  'settings.read',
  'audit.read',
] as const
export type Permission = (typeof permissions)[number]

// Administrative access does not imply access to clinical records.
export const rolePermissions: Record<StaffRole, readonly Permission[]> = {
  administrator: [
    'dashboard.read',
    'patients.read',
    'patients.write',
    'patients.branches.manage',
    'appointments.read',
    'billing.read',
    'inventory.read',
    'staff.read',
    'reports.read',
    'settings.read',
    'audit.read',
  ],
  dentist: [
    'dashboard.read',
    'patients.read',
    'appointments.read',
    'clinical.read',
    'clinical.write',
    'reports.read',
  ],
  dental_assistant: [
    'dashboard.read',
    'patients.read',
    'appointments.read',
    'clinical.read',
    'inventory.read',
  ],
  receptionist: [
    'dashboard.read',
    'patients.read',
    'patients.write',
    'appointments.read',
  ],
  billing_staff: [
    'dashboard.read',
    'patients.read',
    'billing.read',
    'reports.read',
  ],
}

export interface AccessScope {
  clinicId: string
  branchId: string | null
}

export function hasPermission(
  staff: StaffAccess | null,
  permission: Permission,
  scope?: AccessScope,
): boolean {
  if (!staff?.isActive || (scope && scope.clinicId !== staff.clinicId))
    return false
  return staff.assignments.some(
    (assignment) =>
      assignment.clinicId === staff.clinicId &&
      (rolePermissions[assignment.role]?.includes(permission) ?? false) &&
      // No scope is only for navigation and non-resource workspace checks.
      (!scope ||
        assignment.branchId === null ||
        assignment.branchId === scope.branchId),
  )
}

export function assertPermission(
  staff: StaffAccess | null,
  permission: Permission,
  scope: AccessScope,
): asserts staff is StaffAccess {
  if (!hasPermission(staff, permission, scope))
    throw new Error('Access denied.')
}
