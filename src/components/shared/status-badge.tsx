import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return (
    <Badge
      variant="outline"
      className={cn('font-normal', {
        'border-primary/20 bg-primary/5 text-primary': tone === 'success',
        'border-amber-600/20 bg-amber-600/5 text-amber-700 dark:text-amber-400':
          tone === 'warning',
        'border-destructive/20 bg-destructive/5 text-destructive':
          tone === 'danger',
      })}
    >
      {children}
    </Badge>
  )
}
