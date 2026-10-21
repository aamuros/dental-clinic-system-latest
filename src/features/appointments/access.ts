import { hasPermission } from '@/lib/auth/permissions'
import type { StaffAccess } from '@/types/auth'

// Keep scheduling permissions local so parallel patient permission work is untouched.
export function canManageAppointments(staff: StaffAccess, branchId?: string) {
  return (
    hasPermission(
      staff,
      'appointments.read',
      branchId ? { clinicId: staff.clinicId, branchId } : undefined,
    ) &&
    staff.assignments.some(
      (assignment) =>
        assignment.clinicId === staff.clinicId &&
        ['administrator', 'dentist', 'receptionist'].includes(
          assignment.role,
        ) &&
        (!branchId ||
          assignment.branchId === null ||
          assignment.branchId === branchId),
    )
  )
}
