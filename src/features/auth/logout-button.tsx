import { useServerFn } from '@tanstack/react-start'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { logoutFn } from '@/server/functions/auth'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

export function LogoutButton() {
  const logout = useServerFn(logoutFn)
  const router = useRouter()
  const queryClient = useQueryClient()
  return (
    <ConfirmDialog
      title="Sign out of your workspace?"
      description="Your current session on this browser will end."
      confirmLabel="Sign out"
      trigger={
        <Button variant="ghost" size="icon" aria-label="Sign out">
          <LogOut className="size-4" aria-hidden="true" />
        </Button>
      }
      onConfirm={async () => {
        await logout()
        queryClient.clear()
        router.clearCache()
        await router.invalidate()
        await router.navigate({ to: '/login' })
      }}
    />
  )
}
