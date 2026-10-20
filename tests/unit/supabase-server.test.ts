import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CookieAdapter {
  cookieOptions: { path: string; sameSite: string; secure: boolean }
  cookies: {
    getAll: () => { name: string; value: string }[]
    setAll: (
      cookies: {
        name: string
        value: string
        options: { path: string; maxAge?: number }
      }[],
      headers: Record<string, string>,
    ) => void
  }
}

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn<
    (url: string, key: string, options: CookieAdapter) => object
  >(() => ({})),
  getCookies: vi.fn<() => Record<string, string>>(),
  getRequest: vi.fn<() => Request>(),
  setCookie: vi.fn(),
  setResponseHeader: vi.fn(),
}))
vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))
vi.mock('@tanstack/react-start/server', () => mocks)
vi.mock('@/lib/env', () => ({
  requirePublicEnv: () => ({
    VITE_SUPABASE_URL: 'http://127.0.0.1:55321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_unit_fixture',
  }),
}))

import { createServerSupabaseClient } from '@/lib/supabase/server'

beforeEach(() => {
  mocks.getRequest.mockReturnValue(
    new Request('https://clinic.example.invalid/patients'),
  )
  mocks.getCookies.mockReturnValue({
    'session.0': 'synthetic-part-one',
    'session.1': 'synthetic-part-two',
  })
})

function adapter() {
  createServerSupabaseClient()
  const options = mocks.createServerClient.mock.calls.at(-1)?.[2]
  if (!options) throw new Error('No server client was created.')
  return options
}

describe('SSR session transport', () => {
  it('uses secure, scoped cookies for HTTPS and permits local HTTP development', () => {
    expect(adapter().cookieOptions).toEqual({
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
    mocks.getRequest.mockReturnValue(new Request('http://127.0.0.1:3037/login'))
    expect(adapter().cookieOptions.secure).toBe(false)
  })
  it('passes all cookie chunks through without dropping part of the session', () => {
    expect(adapter().cookies.getAll()).toEqual([
      { name: 'session.0', value: 'synthetic-part-one' },
      { name: 'session.1', value: 'synthetic-part-two' },
    ])
  })
  it('forwards token-refresh cookies, cookie deletions, and cache headers', () => {
    const options = adapter()
    options.cookies.setAll(
      [
        {
          name: 'session.0',
          value: 'synthetic-refreshed-session',
          options: { path: '/' },
        },
        { name: 'session.1', value: '', options: { path: '/', maxAge: 0 } },
      ],
      {
        'Cache-Control': 'private, no-store',
        Expires: '0',
        Pragma: 'no-cache',
      },
    )
    expect(mocks.setCookie).toHaveBeenCalledWith(
      'session.0',
      'synthetic-refreshed-session',
      { path: '/' },
    )
    expect(mocks.setCookie).toHaveBeenCalledWith('session.1', '', {
      path: '/',
      maxAge: 0,
    })
    for (const [name, value] of Object.entries({
      'Cache-Control': 'private, no-store',
      Expires: '0',
      Pragma: 'no-cache',
    }))
      expect(mocks.setResponseHeader).toHaveBeenCalledWith(name, value)
  })
  it('creates separate clients for concurrent staff requests and opts out of shared caching', () => {
    const first = createServerSupabaseClient()
    const second = createServerSupabaseClient()
    expect(first).not.toBe(second)
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2)
    expect(mocks.setResponseHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    )
  })
})
