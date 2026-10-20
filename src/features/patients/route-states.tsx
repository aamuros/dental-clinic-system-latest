import { Link, useRouter } from '@tanstack/react-router'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'

export function PatientRouteError() {
  const router = useRouter()
  return (
    <ErrorState
      description="Unable to load patient management. Check your connection and try again."
      onRetry={() => void router.invalidate()}
    />
  )
}

export function PatientNotFound() {
  return (
    <EmptyState
      title="Patient unavailable"
      description="The record could not be found or you no longer have access."
      action={
        <Link to="/patients" className="text-sm underline">
          Back to patients
        </Link>
      }
    />
  )
}
