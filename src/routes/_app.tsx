import { createFileRoute } from '@tanstack/react-router'
import { getWorkspaceFn } from '@/server/functions/workspace'
import { AppLayout } from '@/components/layout/app-layout'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => ({ workspace: await getWorkspaceFn() }),
  component: AppRoute,
})

function AppRoute() {
  const { workspace } = Route.useRouteContext()
  return <AppLayout workspace={workspace} />
}
