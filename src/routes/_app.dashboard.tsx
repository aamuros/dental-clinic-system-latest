import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/dashboard/dashboard-page'

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardRoute,
})

function DashboardRoute() {
  const { workspace } = Route.useRouteContext()
  return <DashboardPage workspace={workspace} />
}
