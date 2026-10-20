import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthStateFn } from '@/server/functions/auth'
import { LoginPage } from '@/features/auth/login-page'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const auth = await getAuthStateFn()
    if (auth.status === 'authenticated') throw redirect({ to: '/dashboard' })
    return { auth }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { auth } = Route.useRouteContext()
  return <LoginPage auth={auth} />
}
