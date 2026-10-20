import { createFileRoute, Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/access-denied')({
  component: () => (
    <EmptyState
      icon={ShieldAlert}
      title="Access restricted"
      description="Your current role does not have access to this module. Contact your clinic administrator if you need access."
      action={
        <Button variant="outline" asChild>
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      }
    />
  ),
})
