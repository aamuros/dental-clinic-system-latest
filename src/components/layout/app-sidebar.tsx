import { Link } from '@tanstack/react-router'
import { Cross, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hasPermission, roleLabels } from '@/lib/auth/permissions'
import { modules } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/types/auth'

export function AppSidebar({
  workspace,
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  workspace: Workspace
  collapsed?: boolean
  onToggle?: () => void
  onNavigate?: () => void
}) {
  const roles = [
    ...new Set(
      workspace.staff.assignments.map(
        (assignment) => roleLabels[assignment.role],
      ),
    ),
  ]
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'flex h-20 items-center gap-3 px-6',
          collapsed && 'justify-center px-3',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Cross className="size-5" aria-hidden="true" />
        </span>
        {!collapsed && (
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Dental Clinic
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Staff workspace
            </p>
          </div>
        )}
      </div>
      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-6 overflow-y-auto px-3 py-4"
      >
        {['Workspace', 'Administration'].map((group) => {
          const visible = modules.filter(
            (module) =>
              module.group === group &&
              hasPermission(workspace.staff, module.permission),
          )
          if (!visible.length) return null
          return (
            <div key={group}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                  {group}
                </p>
              )}
              <div className="space-y-1">
                {visible.map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={cn(
                      'group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      collapsed && 'justify-center px-2',
                    )}
                    activeProps={{
                      className: 'bg-sidebar-accent text-sidebar-primary',
                      'aria-current': 'page',
                    }}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                    <span className={cn(collapsed && 'sr-only')}>{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="m-3 border-t pt-4">
        {!collapsed && (
          <div className="mb-4 px-3">
            <p className="truncate text-xs font-medium">
              {workspace.clinic.name}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {roles.join(' · ')}
            </p>
          </div>
        )}
        {onToggle && (
          <Button
            variant="ghost"
            className="hidden w-full justify-start gap-3 text-muted-foreground md:flex"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="size-4" aria-hidden="true" />
                <span className="text-xs">Collapse sidebar</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
