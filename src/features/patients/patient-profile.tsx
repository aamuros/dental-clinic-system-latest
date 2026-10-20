import { Link } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import type { Patient } from '@/server/functions/patients'
import type { Workspace } from '@/types/auth'
import { genderLabels } from './schemas'
import {
  canEditPatient,
  formatBirthDate,
  formatRegistrationDate,
} from './patient-utils'

export function PatientProfilePage({
  patient,
  workspace,
  saved,
}: {
  patient: Patient
  workspace: Workspace
  saved?: 'created' | 'updated'
}) {
  const details = [
    ['First name', patient.first_name],
    ['Middle name', patient.middle_name],
    ['Last name', patient.last_name],
    ['Birth date', formatBirthDate(patient.birth_date)],
    ['Gender', genderLabels[patient.gender as keyof typeof genderLabels]],
    ['Phone', patient.phone],
    ['Email', patient.email],
    ['Address', patient.address],
  ]
  return (
    <>
      <Link
        to="/patients"
        className="mb-5 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to patients
      </Link>
      {saved && (
        <p
          role="status"
          className="mb-6 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
        >
          Patient {saved === 'created' ? 'registered' : 'updated'} successfully.
        </p>
      )}
      <PageHeader
        title={[patient.first_name, patient.middle_name, patient.last_name]
          .filter(Boolean)
          .join(' ')}
        description={`Registered ${formatRegistrationDate(patient.created_at, workspace.clinic.timezone)}`}
        eyebrow="PATIENT PROFILE"
        action={
          canEditPatient(patient, workspace) && (
            <Button asChild>
              <Link
                to="/patients/$patientId/edit"
                params={{ patientId: patient.id }}
              >
                <Pencil aria-hidden="true" />
                Edit patient
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
        <section aria-labelledby="patient-information">
          <h2 id="patient-information" className="mb-5 text-sm font-semibold">
            Personal & contact information
          </h2>
          <dl className="grid gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {value || 'Not recorded'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <aside>
          <h2 className="mb-5 text-sm font-semibold">Associated branches</h2>
          <ul className="divide-y border-y">
            {patient.patient_branch_access
              .filter((link) => link.branches)
              .map((link) => (
                <li className="py-4 text-sm" key={link.branch_id}>
                  {link.branches?.name}
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Branches available to your account are shown.
          </p>
          <dl className="mt-8 space-y-4">
            <div>
              <dt className="text-xs text-muted-foreground">Patient ID</dt>
              <dd className="mt-1 break-all font-mono text-xs">{patient.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last updated</dt>
              <dd className="mt-1 text-sm">
                {formatRegistrationDate(
                  patient.updated_at,
                  workspace.clinic.timezone,
                )}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  )
}
