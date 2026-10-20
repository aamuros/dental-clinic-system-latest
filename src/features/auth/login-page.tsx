import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Cross, ArrowRight, LoaderCircle } from 'lucide-react'
import { loginSchema } from '@/features/auth/schemas'
import type { LoginInput } from '@/features/auth/schemas'
import { loginFn } from '@/server/functions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { LogoutButton } from '@/features/auth/logout-button'
import type { AuthState } from '@/types/auth'

export function LoginPage({ auth }: { auth: AuthState }) {
  const router = useRouter()
  const login = useServerFn(loginFn)
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const configured = auth.status !== 'unconfigured'
  async function submit(values: LoginInput) {
    clearErrors('root')
    try {
      const result = await login({ data: values })
      if (result.error) {
        setError('root', { message: result.error })
        return
      }
      await router.invalidate()
      await router.navigate({ to: '/dashboard' })
    } catch {
      setError('root', {
        message: 'Sign-in is temporarily unavailable. Please try again.',
      })
    }
  }
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Cross className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Dental Clinic</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="mb-3 text-xs font-medium tracking-wide text-primary">
            CLINIC WORKSPACE
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Staff sign in
          </h1>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            Sign in with the account provided by your clinic administrator.
          </p>
          {auth.status === 'blocked' ? (
            <div className="space-y-5">
              <div
                role="alert"
                className="rounded-lg border p-4 text-sm leading-6"
              >
                Your account does not have active staff access. Contact your
                clinic administrator.
              </div>
              <div className="flex items-center gap-2 text-sm">
                <LogoutButton />
                <span>Sign out to use another account</span>
              </div>
            </div>
          ) : (
            <>
              {!configured && (
                <div
                  role="alert"
                  className="mb-6 rounded-lg border border-amber-600/20 bg-amber-600/5 p-4 text-sm leading-6"
                >
                  Sign-in is not configured. Ask your administrator to complete
                  the application setup.
                </div>
              )}
              <form
                noValidate
                onSubmit={handleSubmit(submit)}
                className="space-y-5"
                aria-busy={isSubmitting}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@clinic.com"
                    disabled={!configured || isSubmitting}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className="h-11"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p
                      id="email-error"
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    disabled={!configured || isSubmitting}
                    aria-invalid={!!errors.password}
                    aria-describedby={
                      errors.password ? 'password-error' : undefined
                    }
                    className="h-11"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p
                      id="password-error"
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {errors.password.message}
                    </p>
                  )}
                </div>
                {errors.root && (
                  <p
                    role="alert"
                    className="text-sm leading-6 text-destructive"
                  >
                    {errors.root.message}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={!configured || isSubmitting}
                  className="h-11 w-full"
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>
              <p className="mt-7 text-center text-xs leading-6 text-muted-foreground">
                Need access or help with your password?
                <br />
                Contact your clinic administrator.
              </p>
            </>
          )}
        </div>
      </main>
      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        Access is limited to authorized clinic staff.
      </footer>
    </div>
  )
}
