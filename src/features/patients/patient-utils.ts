import { hasPermission } from '@/lib/auth/permissions'
import type { Patient } from '@/server/functions/patients'
import type { Workspace } from '@/types/auth'

export function canEditPatient(patient: Patient, workspace: Workspace) {
  return patient.patient_branch_access.some((link) =>
    hasPermission(workspace.staff, 'patients.write', {
      clinicId: workspace.clinic.id,
      branchId: link.branch_id,
    }),
  )
}

export function formatBirthDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00Z`))
    : 'Not recorded'
}

export function formatRegistrationDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: timezone,
  }).format(new Date(value))
}
