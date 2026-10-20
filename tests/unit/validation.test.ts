import { describe, expect, it } from 'vitest'
import { publicEnvSchema } from '@/lib/env'
import { loginSchema } from '@/features/auth/schemas'

describe('configuration and login input', () => {
  it('rejects missing configuration and privileged key formats', () => {
    expect(publicEnvSchema.safeParse({}).success).toBe(false)
    expect(
      publicEnvSchema.safeParse({
        VITE_SUPABASE_URL: 'https://example.invalid',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_synthetic_unit_fixture',
      }).success,
    ).toBe(false)
  })
  it('accepts publishable configuration and rejects non-HTTP URLs', () => {
    const env = {
      VITE_SUPABASE_URL: 'http://127.0.0.1:55321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_unit_fixture',
    }
    expect(publicEnvSchema.safeParse(env).success).toBe(true)
    expect(
      publicEnvSchema.safeParse({
        ...env,
        VITE_SUPABASE_URL: 'file:///tmp/test',
      }).success,
    ).toBe(false)
  })
  it('validates login data at the server boundary', () => {
    expect(
      loginSchema.safeParse({ email: 'invalid', password: '' }).success,
    ).toBe(false)
    expect(
      loginSchema.safeParse({
        email: 'synthetic@example.invalid',
        password: 'synthetic-unit-fixture',
      }).success,
    ).toBe(true)
  })
})
