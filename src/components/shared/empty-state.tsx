import { Inbox } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string
  description: string
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
