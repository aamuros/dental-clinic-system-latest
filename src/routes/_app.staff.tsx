import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/components/shared/module-placeholder'
import { ensureModuleAccess } from '@/lib/auth/navigation-access'

export const Route = createFileRoute('/_app/staff')({
  beforeLoad: ({ context }) =>
    ensureModuleAccess(context.workspace.staff, 'staff'),
  component: () => <ModulePlaceholder moduleId="staff" />,
})
