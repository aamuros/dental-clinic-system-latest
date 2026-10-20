import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/components/shared/module-placeholder'
import { ensureModuleAccess } from '@/lib/auth/navigation-access'

export const Route = createFileRoute('/_app/appointments')({
  beforeLoad: ({ context }) =>
    ensureModuleAccess(context.workspace.staff, 'appointments'),
  component: () => <ModulePlaceholder moduleId="appointments" />,
})
