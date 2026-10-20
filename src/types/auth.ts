import type { Database } from '@/types/database'

export type StaffRole = Database['public']['Enums']['staff_role']

export interface RoleAssignment {
  clinicId: string
  branchId: string | null
  role: StaffRole
}

export interface StaffAccess {
  id: string
  clinicId: string
  displayName: string
  isActive: boolean
  assignments: RoleAssignment[]
}

export type AuthState =
  | { status: 'unconfigured' }
  | { status: 'anonymous' }
  | { status: 'blocked' }
  | { status: 'authenticated'; staff: StaffAccess }

export interface Workspace {
  staff: StaffAccess
  clinic: { id: string; name: string; timezone: string }
  branches: { id: string; name: string }[]
}
