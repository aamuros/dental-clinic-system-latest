import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ensureModuleAccess } from '@/lib/auth/navigation-access'
import { AppointmentCalendarPage } from '@/features/appointments/calendar-page'
import { calendarSearchSchema } from '@/features/appointments/schemas'
import { getAppointmentCalendarFn } from '@/features/appointments/server'
import { LoadingState } from '@/components/shared/loading-state'
import { ErrorState } from '@/components/shared/error-state'

export const Route = createFileRoute('/_app/appointments')({
  beforeLoad: ({ context }) =>
    ensureModuleAccess(context.workspace.staff, 'appointments'),
  validateSearch: calendarSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAppointmentCalendarFn({ data: deps }),
  pendingComponent: () => <LoadingState label="Loading appointments…" />,
  errorComponent: AppointmentError,
  component: AppointmentsRoute,
})

function AppointmentsRoute() {
  return (
    <AppointmentCalendarPage
      workspace={Route.useRouteContext().workspace}
      calendar={Route.useLoaderData()}
      search={Route.useSearch()}
    />
  )
}

function AppointmentError() {
  const router = useRouter()
  return (
    <ErrorState
      description="Unable to load appointments. Check your access and connection, then try again."
      onRetry={() => void router.invalidate()}
    />
  )
}
