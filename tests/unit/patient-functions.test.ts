import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffAccess } from '@/types/auth'

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  }
  return {
    query,
    from: vi.fn(() => query),
    rpc: vi.fn(),
    staff: {} as StaffAccess,
  }
})

vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('@/server/middleware/auth', () => ({ staffMiddleware: {} }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let validator: { parse: (input: unknown) => unknown }
    const builder = {
      middleware: () => builder,
      validator: (schema: typeof validator) => {
        validator = schema
        return builder
      },
      handler:
        (handler: (input: { data: unknown; context: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          handler({
            data: validator.parse(input.data),
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
  getPatientFn,
  listPatientsFn,
  savePatientFn,
} from '@/server/functions/patients'

const branchId = '20000000-0000-4000-8000-000000000001'
const otherBranchId = '20000000-0000-4000-8000-000000000002'
const patientId = '40000000-0000-4000-8000-000000000001'
const updatedAt = '2026-10-20T01:00:00.123456+00:00'
const values = {
  firstName: 'Ana',
  middleName: '',
  lastName: 'Santos',
  birthDate: '',
  gender: 'unspecified' as const,
  phone: '',
  email: '',
  address: '',
  branchIds: [branchId],
  allowDuplicate: false,
}

beforeEach(() => {
  mocks.staff = {
    id: 'staff',
    clinicId: 'clinic',
    displayName: 'Synthetic',
    isActive: true,
    assignments: [{ clinicId: 'clinic', branchId, role: 'receptionist' }],
  }
  mocks.query.single.mockResolvedValue({
    data: { timezone: 'Asia/Manila' },
    error: null,
  })
  mocks.query.range.mockResolvedValue({ data: [], count: 0, error: null })
  mocks.query.maybeSingle.mockResolvedValue({
    data: { id: patientId, patient_branch_access: [{ branch_id: branchId }] },
    error: null,
  })
  mocks.rpc.mockImplementation((name) =>
    name === 'search_patients'
      ? mocks.query
      : Promise.resolve({
          data: { status: 'saved', id: patientId },
          error: null,
        }),
  )
})

describe('patient directory server function', () => {
  it('scopes every query to the verified clinic and applies stable sorting and pagination', async () => {
    await listPatientsFn({
      data: { q: 'Ana', branchId, sort: 'name', page: 3 },
    })
    expect(mocks.query.eq).toHaveBeenCalledWith('clinic_id', 'clinic')
    expect(mocks.query.eq).toHaveBeenCalledWith(
      'patient_branch_access.branch_id',
      branchId,
    )
    expect(mocks.rpc).toHaveBeenCalledWith(
      'search_patients',
      {
        p_query: 'Ana',
      },
      { get: true, count: 'exact' },
    )
    expect(mocks.query.order.mock.calls.map((args) => args[0])).toEqual([
      'last_name',
      'first_name',
      'id',
    ])
    expect(mocks.query.range).toHaveBeenCalledWith(40, 59)
  })
  it('passes literal search text to the indexed RPC without building a PostgREST filter', async () => {
    await listPatientsFn({
      data: { q: '50%_\\', branchId: '', sort: 'name', page: 1 },
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'search_patients',
      {
        p_query: '50%_\\',
      },
      { get: true, count: 'exact' },
    )
    expect(mocks.query.ilike).not.toHaveBeenCalled()
  })
  it('denies an unassigned branch before querying', async () => {
    await expect(
      listPatientsFn({
        data: { q: '', branchId: patientId, sort: 'name', page: 1 },
      }),
    ).rejects.toThrow('Access denied')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('sorts registration dates in the requested direction', async () => {
    await listPatientsFn({
      data: { q: '', branchId: '', sort: 'newest', page: 1 },
    })
    expect(mocks.query.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
  })
  it('recovers the total for a bookmarked page beyond the available rows', async () => {
    mocks.query.range
      .mockResolvedValueOnce({
        data: null,
        count: null,
        error: { code: 'PGRST103' },
      })
      .mockResolvedValueOnce({ data: [{}], count: 4, error: null })
    expect(
      await listPatientsFn({
        data: { q: '', branchId: '', sort: 'name', page: 9 },
      }),
    ).toEqual({ patients: [], total: 4 })
    expect(mocks.query.range).toHaveBeenLastCalledWith(0, 0)
  })
  it('reports safe errors when the database is unavailable', async () => {
    mocks.query.range.mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'Internal database details' },
    })
    await expect(
      listPatientsFn({ data: { q: '', branchId: '', sort: 'name', page: 1 } }),
    ).rejects.toThrow('Unable to load patients. Please try again.')
  })
})

describe('patient profile server function', () => {
  it('fetches only the requested patient in the verified clinic', async () => {
    await getPatientFn({ data: { id: patientId } })
    expect(mocks.query.eq).toHaveBeenCalledWith('id', patientId)
    expect(mocks.query.eq).toHaveBeenCalledWith('clinic_id', 'clinic')
  })
  it('treats missing and inaccessible profiles alike', async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    await expect(
      getPatientFn({ data: { id: patientId } }),
    ).rejects.toMatchObject({ isNotFound: true })
    mocks.query.maybeSingle.mockResolvedValueOnce({
      data: { patient_branch_access: [{ branch_id: 'other' }] },
      error: null,
    })
    await expect(
      getPatientFn({ data: { id: patientId } }),
    ).rejects.toMatchObject({ isNotFound: true })
  })
})

describe('patient save server function', () => {
  it('uses the atomic RPC with validated data and concurrency token', async () => {
    expect(
      await savePatientFn({
        data: { ...values, id: patientId, expectedUpdatedAt: updatedAt },
      }),
    ).toEqual({ error: null, result: { status: 'saved', id: patientId } })
    expect(mocks.rpc).toHaveBeenCalledWith('save_patient', {
      p_details: {
        firstName: 'Ana',
        middleName: '',
        lastName: 'Santos',
        birthDate: '',
        gender: 'unspecified',
        phone: '',
        email: '',
        address: '',
      },
      p_branch_ids: [branchId],
      p_patient_id: patientId,
      p_expected_updated_at: updatedAt,
      p_allow_duplicate: false,
    })
  })
  it.each(['dentist', 'dental_assistant', 'billing_staff'] as const)(
    'denies %s writes before calling the database',
    async (role) => {
      mocks.staff.assignments[0]!.role = role
      await expect(savePatientFn({ data: values })).rejects.toThrow(
        'Access denied',
      )
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )
  it('denies cross-branch sharing by a receptionist who can edit in both branches', async () => {
    mocks.staff.assignments.push({
      clinicId: 'clinic',
      branchId: otherBranchId,
      role: 'receptionist',
    })
    await expect(
      savePatientFn({
        data: {
          ...values,
          branchIds: [branchId, otherBranchId],
          id: patientId,
          expectedUpdatedAt: updatedAt,
        },
      }),
    ).rejects.toThrow('Access denied')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('allows a multi-branch receptionist to choose one initial branch, but not several', async () => {
    mocks.staff.assignments.push({
      clinicId: 'clinic',
      branchId: otherBranchId,
      role: 'receptionist',
    })
    await expect(
      savePatientFn({ data: { ...values, branchIds: [otherBranchId] } }),
    ).resolves.toMatchObject({ error: null })
    mocks.rpc.mockClear()
    await expect(
      savePatientFn({
        data: { ...values, branchIds: [branchId, otherBranchId] },
      }),
    ).rejects.toThrow('Access denied')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('allows an administrator to share an accessible patient with an authorized branch', async () => {
    mocks.staff.assignments = [
      { clinicId: 'clinic', branchId: null, role: 'administrator' },
    ]
    await expect(
      savePatientFn({
        data: {
          ...values,
          branchIds: [otherBranchId],
          id: patientId,
          expectedUpdatedAt: updatedAt,
        },
      }),
    ).resolves.toMatchObject({ error: null })
    expect(mocks.rpc).toHaveBeenCalled()
  })
  it.each(['source', 'destination'])(
    'requires administrator authority on the %s branch',
    async (side) => {
      mocks.staff.assignments = [
        {
          clinicId: 'clinic',
          branchId,
          role: side === 'source' ? 'receptionist' : 'administrator',
        },
        {
          clinicId: 'clinic',
          branchId: otherBranchId,
          role: side === 'source' ? 'administrator' : 'receptionist',
        },
      ]
      await expect(
        savePatientFn({
          data: {
            ...values,
            branchIds: [otherBranchId],
            id: patientId,
            expectedUpdatedAt: updatedAt,
          },
        }),
      ).rejects.toThrow('Access denied')
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )
  it('requires write access to the existing patient before granting a new branch', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: { patient_branch_access: [{ branch_id: 'other' }] },
      error: null,
    })
    await expect(
      savePatientFn({
        data: { ...values, id: patientId, expectedUpdatedAt: updatedAt },
      }),
    ).rejects.toThrow('Patient unavailable or access denied')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('returns duplicate candidates without converting the warning into a successful save', async () => {
    const result = {
      status: 'duplicates',
      matches: [
        {
          id: patientId,
          first_name: 'Ana',
          last_name: 'Santos',
          birth_date: null,
        },
      ],
    }
    mocks.rpc.mockResolvedValue({ data: result, error: null })
    expect(await savePatientFn({ data: values })).toEqual({
      result,
      error: null,
    })
  })
  it.each([
    ['PT409', 'This patient has changed. Reload the profile before editing.'],
    [
      '42501',
      'Patient or branch access has changed. Reload the page and try again.',
    ],
    ['XX000', 'Unable to save the patient. Please try again.'],
  ])(
    'maps database error %s to a useful message without exposing backend details',
    async (code, message) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'Internal backend details' },
      })
      expect(await savePatientFn({ data: values })).toEqual({
        result: null,
        error: message,
        ...(code === 'PT409' ? { conflict: true } : {}),
      })
    },
  )
})

describe('patient save clinic time zone', () => {
  it.each([
    ['Asia/Manila', '2026-10-22', null],
    ['Asia/Manila', '2026-10-23', 'Enter a valid birth date'],
    ['America/Los_Angeles', '2026-10-21', null],
    ['America/Los_Angeles', '2026-10-22', 'Enter a valid birth date'],
  ])(
    'validates %s date %s using trusted clinic configuration',
    async (timezone, birthDate, error) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-22T00:30:00Z'))
      mocks.query.single.mockResolvedValue({ data: { timezone }, error: null })
      try {
        const result = await savePatientFn({
          data: { ...values, birthDate, ...{ timezone: 'forged' } },
        })
        expect(mocks.query.eq).toHaveBeenCalledWith('id', 'clinic')
        if (error) {
          expect(result.error).toContain(error)
          expect(mocks.rpc).not.toHaveBeenCalled()
        } else {
          expect(result.error).toBeNull()
          expect(mocks.rpc).toHaveBeenCalled()
        }
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it('fails safely when the clinic time zone cannot be loaded', async () => {
    mocks.query.single.mockResolvedValue({
      data: null,
      error: { message: 'Private details' },
    })
    await expect(
      savePatientFn({ data: { ...values, birthDate: '2000-01-01' } }),
    ).rejects.toThrow('Unable to load the clinic time zone')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
