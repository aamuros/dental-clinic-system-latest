import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configured: true,
  getUser: vi.fn(),
  rows: {} as Record<string, { data: unknown; error: unknown }>,
  from: vi.fn(),
}))
vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  readPublicEnv: () => ({ success: mocks.configured }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}))

import { resolveAuth } from '@/server/services/auth.server'

beforeEach(() => {
  mocks.configured = true
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'staff-a', user_metadata: { role: 'administrator' } } },
    error: null,
  })
  mocks.rows = {
    staff_profiles: {
      data: {
        id: 'staff-a',
        clinic_id: 'clinic-a',
        display_name: 'Synthetic Staff',
        is_active: true,
      },
      error: null,
    },
    staff_role_assignments: {
      data: [{ clinic_id: 'clinic-a', branch_id: 'branch-a', role: 'dentist' }],
      error: null,
    },
    branches: { data: [{ id: 'branch-a' }], error: null },
  }
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: () =>
        Object.assign(Promise.resolve(mocks.rows[table]), {
          maybeSingle: () => Promise.resolve(mocks.rows[table]),
        }),
    }),
  }))
})

describe('verified staff sessions', () => {
  it('fails closed when configuration is missing', async () => {
    mocks.configured = false
    expect((await resolveAuth()).state.status).toBe('unconfigured')
    expect(mocks.getUser).not.toHaveBeenCalled()
  })
  it('treats a missing session as anonymous', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    })
    expect((await resolveAuth()).state.status).toBe('anonymous')
  })
  it('uses protected database assignments rather than editable Auth metadata', async () => {
    const { state } = await resolveAuth()
    expect(state.status).toBe('authenticated')
    if (state.status === 'authenticated')
      expect(
        state.staff.assignments.map((assignment) => assignment.role),
      ).toEqual(['dentist'])
  })
  it('blocks a verified user without a staff profile', async () => {
    mocks.rows.staff_profiles = { data: null, error: null }
    expect((await resolveAuth()).state.status).toBe('blocked')
  })
  it('blocks inactive staff even if their session is verified', async () => {
    mocks.rows.staff_profiles = {
      data: { id: 'staff-a', clinic_id: 'clinic-a', is_active: false },
      error: null,
    }
    expect((await resolveAuth()).state.status).toBe('blocked')
  })
  it('blocks staff with no role assignments', async () => {
    mocks.rows.staff_role_assignments = { data: [], error: null }
    expect((await resolveAuth()).state.status).toBe('blocked')
  })
  it('filters assignments to inactive or inaccessible branches', async () => {
    mocks.rows.branches = { data: [], error: null }
    expect((await resolveAuth()).state.status).toBe('blocked')
  })
  it('reports an Auth outage without leaking the backend error', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: 'AuthError',
        status: 503,
        message: 'Internal backend details',
      },
    })
    await expect(resolveAuth()).rejects.toThrow(
      'Authentication is temporarily unavailable',
    )
  })
  it('fails closed when permission records cannot be loaded', async () => {
    mocks.rows.staff_role_assignments = {
      data: null,
      error: { message: 'Internal backend details' },
    }
    await expect(resolveAuth()).rejects.toThrow(
      'Unable to verify staff permissions',
    )
  })
  it.each([400, 401, 403])(
    'treats invalid or revoked credentials (%s) as anonymous',
    async (status) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthError', status },
      })
      expect((await resolveAuth()).state.status).toBe('anonymous')
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )
  it('handles a missing user without accessing private records', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await resolveAuth()).state.status).toBe('anonymous')
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('fails closed on a profile lookup error', async () => {
    mocks.rows.staff_profiles = {
      data: null,
      error: { message: 'Internal backend details' },
    }
    await expect(resolveAuth()).rejects.toThrow('Unable to verify staff access')
  })
  it('fails closed on a branch lookup error', async () => {
    mocks.rows.branches = {
      data: null,
      error: { message: 'Internal backend details' },
    }
    await expect(resolveAuth()).rejects.toThrow(
      'Unable to verify staff permissions',
    )
  })
  it('retains only assignments for branches visible to the verified staff member', async () => {
    mocks.rows.staff_role_assignments = {
      data: [
        { clinic_id: 'clinic-a', branch_id: 'branch-a', role: 'dentist' },
        {
          clinic_id: 'clinic-a',
          branch_id: 'inactive-branch',
          role: 'dentist',
        },
      ],
      error: null,
    }
    const { state } = await resolveAuth()
    expect(state.status).toBe('authenticated')
    if (state.status === 'authenticated')
      expect(state.staff.assignments).toEqual([
        { clinicId: 'clinic-a', branchId: 'branch-a', role: 'dentist' },
      ])
  })
  it('permits a valid clinic administrator without an active branch assignment', async () => {
    mocks.rows.branches = { data: [], error: null }
    mocks.rows.staff_role_assignments = {
      data: [{ clinic_id: 'clinic-a', branch_id: null, role: 'administrator' }],
      error: null,
    }
    expect((await resolveAuth()).state.status).toBe('authenticated')
  })
  it('rechecks staff activation on every request despite an unchanged Auth user', async () => {
    expect((await resolveAuth()).state.status).toBe('authenticated')
    mocks.rows.staff_profiles = {
      data: { id: 'staff-a', clinic_id: 'clinic-a', is_active: false },
      error: null,
    }
    expect((await resolveAuth()).state.status).toBe('blocked')
    expect(mocks.getUser).toHaveBeenCalledTimes(2)
  })
})
