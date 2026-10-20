import { createFileRoute, Outlet } from '@tanstack/react-router'
import {
  PatientRouteError,
  PatientNotFound,
} from '@/features/patients/route-states'
import { LoadingState } from '@/components/shared/loading-state'
import { ensureModuleAccess } from '@/lib/auth/navigation-access'

export const Route = createFileRoute('/_app/patients')({
  beforeLoad: ({ context }) =>
    ensureModuleAccess(context.workspace.staff, 'patients'),
  component: Outlet,
  pendingComponent: LoadingState,
  errorComponent: PatientRouteError,
  notFoundComponent: PatientNotFound,
})
