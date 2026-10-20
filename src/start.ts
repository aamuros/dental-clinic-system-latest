import {
  createStart,
  createMiddleware,
  createCsrfMiddleware,
} from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'

const responsePolicy = createMiddleware().server(async ({ next }) => {
  setResponseHeaders(
    new Headers({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    }),
  )
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    responsePolicy,
    createCsrfMiddleware({
      filter: (context) => context.handlerType === 'serverFn',
    }),
  ],
}))
