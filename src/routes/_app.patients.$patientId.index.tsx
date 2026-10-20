import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { PatientProfilePage } from '@/features/patients/patient-profile'
import { Route as PatientRoute } from './_app.patients.$patientId'

export const Route = createFileRoute('/_app/patients/$patientId/')({
  validateSearch: z.object({
    saved: z.enum(['created', 'updated']).optional().catch(undefined),
  }),
  component: PatientProfileRoute,
})

function PatientProfileRoute() {
  return (
    <PatientProfilePage
      patient={PatientRoute.useLoaderData()}
      workspace={Route.useRouteContext().workspace}
      saved={Route.useSearch().saved}
    />
  )
}
