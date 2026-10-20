import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { LogoutButton } from '@/features/auth/logout-button'
import { modules } from '@/lib/navigation'
import type { Workspace } from '@/types/auth'

export function AppHeader({ workspace }: { workspace: Workspace }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const current =
    modules.find((module) => module.path === pathname)?.label ??
    'Access restricted'
  const initials = workspace.staff.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-xs">
            <li className="hidden text-muted-foreground sm:block">
              <Link to="/dashboard">Workspace</Link>
            </li>
            <li className="hidden sm:block">
              <ChevronRight
                className="size-3 text-muted-foreground"
                aria-hidden="true"
              />
            </li>
            <li className="truncate font-medium" aria-current="page">
              {current}
            </li>
          </ol>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <LogoutButton />
        <div className="ml-3 flex items-center gap-3 border-l pl-4">
          <span
            className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="hidden max-w-44 sm:block">
            <p className="truncate text-xs font-medium">
              {workspace.staff.displayName}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {workspace.branches.length === 1
                ? workspace.branches[0]?.name
                : `${workspace.branches.length} accessible branches`}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
