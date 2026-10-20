import type { LucideIcon } from 'lucide-react'

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
}) {
  return (
    <div className="px-1 py-5 sm:px-5">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
