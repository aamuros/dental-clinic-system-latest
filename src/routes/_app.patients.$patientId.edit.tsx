import { createFileRoute } from '@tanstack/react-router'
import { PatientFormPage } from '@/features/patients/patient-form'
import { Route as PatientRoute } from './_app.patients.$patientId'

export const Route = createFileRoute('/_app/patients/$patientId/edit')({
  component: EditPatientRoute,
})

function EditPatientRoute() {
  const patient = PatientRoute.useLoaderData()
  return (
    <PatientFormPage
      key={patient.updated_at}
      patient={patient}
      workspace={Route.useRouteContext().workspace}
    />
  )
}
