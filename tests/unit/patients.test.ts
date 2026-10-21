import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  directorySchema,
  isValidBirthDate,
  createPatientFormSchema,
  savePatientSchema,
} from '@/features/patients/schemas'
import { hasPermission } from '@/lib/auth/permissions'
import type { StaffAccess, StaffRole } from '@/types/auth'

const patientFormSchema = createPatientFormSchema('Asia/Manila')

const branchId = '20000000-0000-4000-8000-000000000001'
const patient = {
  firstName: '  Ana  ',
  middleName: '',
  lastName: 'Santos',
  birthDate: '2000-02-29',
  gender: 'female',
  phone: '+63 (917) 123-4567',
  email: ' Ana@Example.test ',
  address: '  Synthetic Address  ',
  branchIds: [branchId],
}

describe('patient validation', () => {
  it('normalizes names, email and address while retaining international phone formatting', () => {
    expect(patientFormSchema.parse(patient)).toMatchObject({
      firstName: 'Ana',
      email: 'ana@example.test',
      address: 'Synthetic Address',
      phone: patient.phone,
    })
  })
  it('permits unrecorded optional demographics', () => {
    expect(
      patientFormSchema.safeParse({
        ...patient,
        birthDate: '',
        phone: '',
        email: '',
        gender: 'unspecified',
      }).success,
    ).toBe(true)
  })
  it.each([
    '2001-02-29',
    '2000-02-30',
    '2000-13-01',
    '1899-12-31',
    '2999-01-01',
    '01/01/2000',
  ])('rejects invalid or out-of-range birth date %s', (birthDate) => {
    expect(isValidBirthDate(birthDate, 'Asia/Manila')).toBe(false)
    expect(patientFormSchema.safeParse({ ...patient, birthDate }).success).toBe(
      false,
    )
  })
  it.each([
    { firstName: ' ' },
    { lastName: '' },
    { firstName: 'a'.repeat(101) },
    { email: 'bad-email' },
    { phone: '123' },
    { phone: 'call me 1234567' },
    { phone: '1'.repeat(21) },
    { address: 'x'.repeat(501) },
    { gender: 'invalid' },
    { branchIds: [] },
    { branchIds: ['another-branch'] },
  ])('rejects invalid patient details %j', (change) => {
    expect(patientFormSchema.safeParse({ ...patient, ...change }).success).toBe(
      false,
    )
  })
  it('requires a concurrency token when editing and defaults to duplicate checks', () => {
    const id = '40000000-0000-4000-8000-000000000001'
    expect(savePatientSchema.safeParse({ ...patient, id }).success).toBe(false)
    expect(
      savePatientSchema.parse({
        ...patient,
        id,
        expectedUpdatedAt: '2026-10-20T01:00:00.123456+00:00',
      }).allowDuplicate,
    ).toBe(false)
  })
  it('ignores caller-supplied clinic, actor and audit fields', () => {
    const parsed = savePatientSchema.parse({
      ...patient,
      clinicId: 'forged',
      actorId: 'forged',
    })
    expect(parsed).not.toHaveProperty('clinicId')
    expect(parsed).not.toHaveProperty('actorId')
  })
  it('bounds and validates directory inputs', () => {
    expect(
      directorySchema.parse({ page: -1, sort: 'email;drop', branchId: 'bad' }),
    ).toEqual({ q: '', page: 1, branchId: '', sort: 'name' })
    expect(directorySchema.parse({ page: '2', q: ' Ana ' })).toMatchObject({
      page: 2,
      q: 'Ana',
    })
  })
})

describe('patient write permissions', () => {
  function staff(role: StaffRole): StaffAccess {
    return {
      id: 'staff',
      clinicId: 'clinic',
      displayName: 'Synthetic',
      isActive: true,
      assignments: [{ clinicId: 'clinic', branchId, role }],
    }
  }
  it.each(['administrator', 'receptionist'] as const)(
    'allows %s to write within their assigned branch',
    (role) => {
      expect(
        hasPermission(staff(role), 'patients.write', {
          clinicId: 'clinic',
          branchId,
        }),
      ).toBe(true)
      expect(
        hasPermission(staff(role), 'patients.write', {
          clinicId: 'clinic',
          branchId: 'other',
        }),
      ).toBe(false)
      expect(
        hasPermission(staff(role), 'patients.write', {
          clinicId: 'other',
          branchId,
        }),
      ).toBe(false)
    },
  )
  it.each(['dentist', 'dental_assistant', 'billing_staff'] as const)(
    'keeps %s patient access read-only',
    (role) => {
      expect(
        hasPermission(staff(role), 'patients.read', {
          clinicId: 'clinic',
          branchId,
        }),
      ).toBe(true)
      expect(
        hasPermission(staff(role), 'patients.write', {
          clinicId: 'clinic',
          branchId,
        }),
      ).toBe(false)
    },
  )
  it.each([
    'administrator',
    'dentist',
    'dental_assistant',
    'receptionist',
    'billing_staff',
  ] as const)(
    'restricts branch management for %s to explicit administrator scope',
    (role) => {
      expect(
        hasPermission(staff(role), 'patients.branches.manage', {
          clinicId: 'clinic',
          branchId,
        }),
      ).toBe(role === 'administrator')
      expect(
        hasPermission(staff(role), 'patients.branches.manage', {
          clinicId: 'clinic',
          branchId: 'other',
        }),
      ).toBe(false)
    },
  )
})

describe('clinic-local birth dates', () => {
  afterEach(() => vi.useRealTimers())
  it.each([
    ['Asia/Manila', '2026-10-21T15:59:59Z', '2026-10-21', '2026-10-22'],
    ['Asia/Manila', '2026-10-21T16:00:00Z', '2026-10-22', '2026-10-23'],
    ['America/Los_Angeles', '2026-10-22T06:59:59Z', '2026-10-21', '2026-10-22'],
    ['America/Los_Angeles', '2026-10-22T07:00:00Z', '2026-10-22', '2026-10-23'],
    ['Pacific/Kiritimati', '2026-12-31T10:00:00Z', '2027-01-01', '2027-01-02'],
  ])(
    'uses %s at %s independently of the browser time zone',
    (timezone, instant, today, tomorrow) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(instant))
      const schema = createPatientFormSchema(timezone)
      expect(isValidBirthDate(today, timezone)).toBe(true)
      expect(schema.safeParse({ ...patient, birthDate: today }).success).toBe(
        true,
      )
      expect(isValidBirthDate(tomorrow, timezone)).toBe(false)
      expect(
        schema.safeParse({ ...patient, birthDate: tomorrow }).success,
      ).toBe(false)
    },
  )
  it.each([
    ['1900-01-01', true],
    ['1899-12-31', false],
    ['1900-02-29', false],
    ['2000-02-29', true],
    ['2024-02-29', true],
    ['2025-02-29', false],
    ['2026-04-31', false],
  ])('validates the calendar date %s', (value, valid) => {
    expect(
      isValidBirthDate(value, 'Asia/Manila', new Date('2026-10-21T16:00Z')),
    ).toBe(valid)
  })
})
