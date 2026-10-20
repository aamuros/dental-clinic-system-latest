import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/components/shared/module-placeholder'
import { ensureModuleAccess } from '@/lib/auth/navigation-access'

export const Route = createFileRoute('/_app/inventory')({
  beforeLoad: ({ context }) =>
    ensureModuleAccess(context.workspace.staff, 'inventory'),
  component: () => <ModulePlaceholder moduleId="inventory" />,
})
