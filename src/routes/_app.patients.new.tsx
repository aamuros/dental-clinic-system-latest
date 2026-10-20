import { createFileRoute, redirect } from '@tanstack/react-router'
import { PatientFormPage } from '@/features/patients/patient-form'
import { hasPermission } from '@/lib/auth/permissions'

export const Route = createFileRoute('/_app/patients/new')({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.workspace.staff, 'patients.write'))
      throw redirect({ to: '/access-denied' })
  },
  component: NewPatientRoute,
})

function NewPatientRoute() {
  return <PatientFormPage workspace={Route.useRouteContext().workspace} />
}
