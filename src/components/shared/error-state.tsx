import { CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorState({
  title = 'Something went wrong',
  description = 'We couldn’t load this page. Please try again.',
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <CircleAlert
        className="mb-2 size-7 text-destructive"
        aria-hidden="true"
      />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
