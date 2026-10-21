import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffAccess } from '@/types/auth'
const mocks = vi.hoisted(() => ({
  staff: {} as StaffAccess,
  query: {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/server/middleware/auth', () => ({ staffMiddleware: {} }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let schema: { parse: (input: unknown) => unknown }
    const builder = {
      middleware: () => builder,
      validator: (input: typeof schema) => {
        schema = input
        return builder
      },
      handler:
        (handler: (input: { data: unknown; context: unknown }) => unknown) =>
        async (input: { data: unknown }) =>
          handler({
            data: schema.parse(input.data),
            context: {
              staff: mocks.staff,
              supabase: { from: mocks.from, rpc: mocks.rpc },
            },
          }),
    }
    return builder
  },
}))
import {
  getAppointmentCalendarFn,
  getAppointmentPatientsFn,
  saveAppointmentFn,
} from '@/features/appointments/server'
const branchId = '20000000-0000-4000-8000-000000000001'
const values = {
  branchId,
  patientId: branchId,
  dentistId: branchId,
  localStart: '2030-02-01T09:00',
  duration: 30,
  status: 'scheduled' as const,
}
beforeEach(() => {
  mocks.staff = {
    id: 'staff',
    clinicId: 'clinic',
    displayName: 'Synthetic',
    isActive: true,
    assignments: [{ clinicId: 'clinic', branchId, role: 'receptionist' }],
  }
  mocks.from.mockReturnValue(mocks.query)
  mocks.query.single.mockResolvedValue({
    data: { timezone: 'Asia/Manila' },
    error: null,
  })
  mocks.rpc.mockResolvedValue({ data: branchId, error: null })
  mocks.query.maybeSingle.mockResolvedValue({
    data: { branch_id: branchId, starts_at: '2030-02-01T01:00:00+00:00' },
    error: null,
  })
})
describe('appointment server functions', () => {
  it('derives the clinic time zone and sends absolute time to the audited RPC', async () => {
    expect(await saveAppointmentFn({ data: values })).toEqual({ error: null })
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'clinic')
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_appointment',
      expect.objectContaining({
        p_start: '2030-02-01T01:00:00.000Z',
        p_branch: branchId,
        p_duration: 30,
      }),
    )
  })
  it('rejects unauthorized branch and role before any database operation', async () => {
    await expect(
      saveAppointmentFn({
        data: { ...values, branchId: '20000000-0000-4000-8000-000000000002' },
      }),
    ).rejects.toThrow('Access denied')
    mocks.staff.assignments[0]!.role = 'dental_assistant'
    await expect(saveAppointmentFn({ data: values })).rejects.toThrow(
      'Access denied',
    )
    await expect(
      getAppointmentPatientsFn({ data: { branchId } }),
    ).rejects.toThrow('Access denied')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects nonexistent times before mutation', async () => {
    mocks.query.single.mockResolvedValue({
      data: { timezone: 'America/New_York' },
      error: null,
    })
    expect(
      (
        await saveAppointmentFn({
          data: { ...values, localStart: '2030-03-10T02:30' },
        })
      ).error,
    ).toContain('does not exist')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([
    ['23P01', 'already has an appointment'],
    ['PT409', 'has changed'],
    ['42501', 'access has changed'],
    ['22023', 'Check the time'],
    ['XX000', 'Unable to save'],
  ])('maps %s without exposing backend details', async (code, message) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: 'Secret internal SQL details' },
    })
    expect((await saveAppointmentFn({ data: values })).error).toContain(message)
  })
  it('calculates the requested calendar window in the clinic time zone and forwards filters', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        error: null,
        data:
          name === 'appointment_schedule' ? { appointments: [], total: 0 } : [],
      }),
    )
    await getAppointmentCalendarFn({
      data: {
        date: '2030-02-01',
        view: 'day',
        branchId,
        patient: 'Ana',
        dentistId: branchId,
        status: 'confirmed',
        page: 2,
      },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('appointment_schedule', {
      p_from: '2030-01-31T16:00:00.000Z',
      p_to: '2030-02-01T16:00:00.000Z',
      p_branch: branchId,
      p_dentist: branchId,
      p_patient: 'Ana',
      p_status: 'confirmed',
      p_page: 2,
    })
  })
})

describe('appointment server failure and access boundaries', () => {
  it('denies a calendar at an unassigned branch before querying', async () => {
    await expect(
      getAppointmentCalendarFn({
        data: { branchId: '20000000-0000-4000-8000-000000000002' },
      }),
    ).rejects.toThrow('Access denied')
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('denies inactive and billing staff calendar access', async () => {
    mocks.staff.isActive = false
    await expect(getAppointmentCalendarFn({ data: {} })).rejects.toThrow(
      'Access denied',
    )
    mocks.staff.isActive = true
    mocks.staff.assignments[0]!.role = 'billing_staff'
    await expect(getAppointmentCalendarFn({ data: {} })).rejects.toThrow(
      'Access denied',
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['calendar', 'save'])(
    'handles a missing clinic configuration during %s safely',
    async (operation) => {
      mocks.query.single.mockResolvedValue({
        data: null,
        error: { message: 'Internal SQL failure' },
      })
      await expect(
        operation === 'save'
          ? saveAppointmentFn({ data: values })
          : getAppointmentCalendarFn({ data: {} }),
      ).rejects.toThrow('Unable to load the clinic time zone.')
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )
  it.each(['appointment_schedule', 'appointment_dentists'])(
    'fails safely when %s fails',
    async (failed) => {
      mocks.rpc.mockImplementation((name: string) =>
        Promise.resolve({
          data:
            name === 'appointment_schedule'
              ? { appointments: [], total: 0 }
              : [],
          error: name === failed ? { message: 'Private SQL details' } : null,
        }),
      )
      await expect(
        getAppointmentCalendarFn({ data: { date: '2030-02-01' } }),
      ).rejects.toThrow('Unable to load appointments. Please try again.')
    },
  )
  it('scopes and validates patient lookup results, including exact selection limits', async () => {
    mocks.rpc.mockResolvedValue({
      data: { patients: [{ id: branchId, name: 'Synthetic' }], hasMore: true },
      error: null,
    })
    expect(
      await getAppointmentPatientsFn({ data: { branchId, q: '  50%_  ' } }),
    ).toMatchObject({ hasMore: true })
    expect(mocks.rpc).toHaveBeenCalledWith('appointment_patients', {
      p_branch: branchId,
      p_query: '50%_',
    })
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Private details' },
    })
    await expect(
      getAppointmentPatientsFn({ data: { branchId } }),
    ).rejects.toThrow('Unable to search patients. Please try again.')
  })
  it('rejects malformed booking identifiers and invalid local times before mutation', async () => {
    await expect(
      saveAppointmentFn({ data: { ...values, dentistId: 'bad' } }),
    ).rejects.toThrow()
    expect(
      (
        await saveAppointmentFn({
          data: { ...values, localStart: '2030-02-30T09:00' },
        })
      ).error,
    ).toContain('valid date')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects an ambiguous local time before mutation', async () => {
    mocks.query.single.mockResolvedValue({
      data: { timezone: 'America/New_York' },
      error: null,
    })
    expect(
      (
        await saveAppointmentFn({
          data: { ...values, localStart: '2030-11-03T01:30' },
        })
      ).error,
    ).toContain('occurs twice')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('uses full DST-aware weekly boundaries rather than seven fixed 24-hour days', async () => {
    mocks.query.single.mockResolvedValue({
      data: { timezone: 'America/New_York' },
      error: null,
    })
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === 'appointment_schedule' ? { appointments: [], total: 0 } : [],
        error: null,
      }),
    )
    await getAppointmentCalendarFn({
      data: { date: '2030-03-10', view: 'week' },
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'appointment_schedule',
      expect.objectContaining({
        p_from: '2030-03-04T05:00:00.000Z',
        p_to: '2030-03-11T04:00:00.000Z',
      }),
    )
  })
})

describe('exact existing appointment times', () => {
  const token = '2026-10-21T01:00:00.123456+00:00'
  it.each(['completed', 'cancelled'] as const)(
    'preserves seconds and microseconds during %s without a reschedule',
    async (status) => {
      const instant = '2020-05-01T01:00:17.123456+00:00'
      mocks.query.maybeSingle.mockResolvedValue({
        data: { branch_id: branchId, starts_at: instant },
        error: null,
      })
      expect(
        await saveAppointmentFn({
          data: {
            ...values,
            id: branchId,
            expectedUpdatedAt: token,
            localStart: '2020-05-01T09:00',
            status,
          },
        }),
      ).toEqual({ error: null })
      expect(mocks.query.eq).toHaveBeenCalledWith('clinic_id', 'clinic')
      expect(mocks.rpc).toHaveBeenCalledWith(
        'save_appointment',
        expect.objectContaining({
          p_start: instant,
          p_expected_updated_at: token,
        }),
      )
    },
  )
  it('preserves an unambiguous stored instant whose local hour occurs twice', async () => {
    mocks.query.single.mockResolvedValue({
      data: { timezone: 'America/New_York' },
      error: null,
    })
    mocks.query.maybeSingle.mockResolvedValue({
      data: { branch_id: branchId, starts_at: '2030-11-03T05:30:00+00:00' },
      error: null,
    })
    expect(
      await saveAppointmentFn({
        data: {
          ...values,
          id: branchId,
          expectedUpdatedAt: token,
          localStart: '2030-11-03T01:30',
          status: 'cancelled',
        },
      }),
    ).toEqual({ error: null })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_appointment',
      expect.objectContaining({ p_start: '2030-11-03T05:30:00+00:00' }),
    )
  })
  it('converts a deliberately edited local start rather than preserving the old instant', async () => {
    await saveAppointmentFn({
      data: {
        ...values,
        id: branchId,
        expectedUpdatedAt: token,
        localStart: '2030-02-01T10:00',
      },
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_appointment',
      expect.objectContaining({ p_start: '2030-02-01T02:00:00.000Z' }),
    )
  })
  it.each([
    { data: null, error: null },
    {
      data: { branch_id: 'other', starts_at: '2030-02-01T01:00Z' },
      error: null,
    },
    { data: null, error: { message: 'Private SQL details' } },
  ])(
    'fails safely if the source appointment cannot be verified',
    async (result) => {
      mocks.query.maybeSingle.mockResolvedValue(result)
      const saved = await saveAppointmentFn({
        data: { ...values, id: branchId, expectedUpdatedAt: token },
      })
      expect(saved.error).toBeTruthy()
      expect(saved.error).not.toContain('Private SQL')
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )
})
