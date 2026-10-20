import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string
  description: string
  action?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
