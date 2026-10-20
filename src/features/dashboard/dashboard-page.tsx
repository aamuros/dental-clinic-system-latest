import { Link } from '@tanstack/react-router'
import {
  UsersRound,
  CalendarDays,
  Clock3,
  WalletCards,
  ArrowUpRight,
  Activity,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { hasPermission } from '@/lib/auth/permissions'
import { modules } from '@/lib/navigation'
import type { Workspace } from '@/types/auth'

export function DashboardPage({ workspace }: { workspace: Workspace }) {
  const date = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'full',
    timeZone: workspace.clinic.timezone,
  }).format(new Date())
  const quickActions = modules.filter(
    (module) =>
      ['patients', 'appointments', 'billing'].includes(module.id) &&
      hasPermission(workspace.staff, module.permission),
  )
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your clinic’s day at a glance."
        eyebrow={date}
        action={<StatusBadge>Preview · Placeholder data</StatusBadge>}
      />
      <section
        aria-label="Placeholder statistics"
        className="mb-10 grid grid-cols-1 divide-y border-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x"
      >
        <StatCard
          label="Total Patients"
          value="—"
          detail="Patient totals are not connected"
          icon={UsersRound}
        />
        <StatCard
          label="Today's Appointments"
          value="—"
          detail="Schedule totals are not connected"
          icon={CalendarDays}
        />
        <StatCard
          label="Upcoming Appointments"
          value="—"
          detail="Upcoming visits are not connected"
          icon={Clock3}
        />
        <StatCard
          label="Pending Payments"
          value="—"
          detail={
            hasPermission(workspace.staff, 'billing.read')
              ? 'Billing totals are not connected'
              : 'Billing access is restricted'
          }
          icon={WalletCards}
        />
      </section>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <section aria-labelledby="schedule-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="schedule-heading" className="text-sm font-semibold">
              Today’s Schedule
            </h2>
            <span className="text-xs text-muted-foreground">
              {workspace.clinic.timezone}
            </span>
          </div>
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={CalendarDays}
              title="Your schedule will appear here"
              description="Today’s appointments will be available when scheduling is enabled."
            />
          </div>
        </section>
        <section aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="mb-4 text-sm font-semibold">
            Quick Actions
          </h2>
          <div className="divide-y border-y">
            {quickActions.map(({ path, label, icon: Icon, description }) => (
              <Link
                key={path}
                to={path}
                className="group flex items-center gap-4 py-5 transition-colors hover:text-primary"
              >
                <Icon
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                </div>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Module previews are available. Data entry will be enabled in a
            future release.
          </p>
        </section>
        <section aria-labelledby="activity-heading" className="xl:col-span-2">
          <h2 id="activity-heading" className="mb-4 text-sm font-semibold">
            Recent Activity
          </h2>
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={Activity}
              title="Activity will appear here"
              description="Activity tracking will become available as clinic workflows are enabled."
            />
          </div>
        </section>
      </div>
    </>
  )
}
