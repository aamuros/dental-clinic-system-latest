import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState({
  label = 'Loading workspace…',
}: {
  label?: string
}) {
  return (
    <div className="space-y-5 p-8" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="mt-8 h-64 w-full rounded-xl" />
    </div>
  )
}
