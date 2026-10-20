import {
  HeadContent,
  Scripts,
  Link,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { Button } from '@/components/ui/button'

import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    headers: () => ({ 'Cache-Control': 'private, no-store' }),
    pendingComponent: LoadingState,
    errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
    notFoundComponent: () => (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="my-5 text-sm text-muted-foreground">
          This page could not be found.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Return to workspace</Link>
        </Button>
      </div>
    ),
    head: () => ({
      meta: [
        {
          charSet: 'utf-8',
        },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          title: 'Dental Clinic · Staff Workspace',
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: appCss,
        },
      ],
    }),
    shellComponent: RootDocument,
  },
)

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('clinic-theme');document.documentElement.classList.toggle('dark',t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches)}catch{}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
