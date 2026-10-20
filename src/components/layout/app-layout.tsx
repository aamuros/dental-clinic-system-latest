import { useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/types/auth'

export function AppLayout({ workspace }: { workspace: Workspace }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 border-r transition-[width] duration-200 motion-reduce:transition-none md:block',
          collapsed ? 'w-20' : 'w-60',
        )}
      >
        <AppSidebar
          workspace={workspace}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <AppHeader workspace={workspace} />
          <SheetContent side="left" className="w-72 gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Workspace navigation</SheetTitle>
              <SheetDescription>Choose a clinic module.</SheetDescription>
            </SheetHeader>
            <AppSidebar
              workspace={workspace}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 p-5 outline-none sm:p-8 lg:p-10"
        >
          <Outlet />
        </main>
        <footer className="px-5 pb-5 text-[11px] text-muted-foreground sm:px-8 lg:px-10">
          {workspace.clinic.name} <span aria-hidden="true">·</span> Staff
          workspace
        </footer>
      </div>
    </div>
  )
}
