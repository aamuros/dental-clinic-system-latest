import { modules } from '@/lib/navigation'
import type { ModuleId } from '@/lib/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'

export function ModulePlaceholder({ moduleId }: { moduleId: ModuleId }) {
  const module = modules.find((entry) => entry.id === moduleId)!
  return (
    <>
      <PageHeader
        title={module.label}
        description={module.description}
        action={<StatusBadge>Coming soon</StatusBadge>}
      />
      <section
        className="rounded-xl border bg-card"
        aria-label={`${module.label} preview`}
      >
        <EmptyState
          icon={module.icon}
          title={`${module.label} is being prepared`}
          description={module.empty}
        />
      </section>
    </>
  )
}
