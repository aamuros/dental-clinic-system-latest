import { describe, expect, it } from 'vitest'
import {
  directorySchema,
  isValidBirthDate,
  patientFormSchema,
  savePatientSchema,
} from '@/features/patients/schemas'
import { hasPermission } from '@/lib/auth/permissions'
import type { StaffAccess, StaffRole } from '@/types/auth'

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
    expect(isValidBirthDate(birthDate)).toBe(false)
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
  it.each(['administrator', 'dentist', 'receptionist'] as const)(
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
  it.each(['dental_assistant', 'billing_staff'] as const)(
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
})
