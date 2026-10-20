import { createFileRoute } from '@tanstack/react-router'
import { directorySchema } from '@/features/patients/schemas'
import { PatientDirectoryPage } from '@/features/patients/patient-directory'
import { listPatientsFn } from '@/server/functions/patients'

export const Route = createFileRoute('/_app/patients/')({
  validateSearch: directorySchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listPatientsFn({ data: deps }),
  component: PatientsRoute,
})

function PatientsRoute() {
  const { workspace } = Route.useRouteContext()
  return (
    <PatientDirectoryPage
      workspace={workspace}
      data={Route.useLoaderData()}
      search={Route.useSearch()}
    />
  )
}
