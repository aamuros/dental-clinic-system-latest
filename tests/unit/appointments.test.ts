import { describe, expect, it } from 'vitest'
import { canManageAppointments } from '@/features/appointments/access'
import {
  calendarSearchSchema,
  saveAppointmentSchema,
} from '@/features/appointments/schemas'
import {
  addDays,
  calendarDays,
  clinicDate,
  dayBoundary,
  localToInstant,
} from '@/features/appointments/time'
import type { StaffAccess, StaffRole } from '@/types/auth'

const branchId = '20000000-0000-4000-8000-000000000001'
const valid = {
  branchId,
  patientId: branchId,
  dentistId: branchId,
  localStart: '2030-02-01T09:00',
  duration: 30,
  status: 'scheduled',
}

describe('clinic-local scheduling', () => {
  it('converts Manila wall times independently of the browser time zone', () => {
    expect(localToInstant('2030-02-01T09:00', 'Asia/Manila')).toBe(
      '2030-02-01T01:00:00.000Z',
    )
    expect(clinicDate('Asia/Manila', new Date('2030-02-01T17:00Z'))).toBe(
      '2030-02-02',
    )
  })
  it('uses the offset for the scheduled date including fractional offsets', () => {
    expect(localToInstant('2030-07-01T09:00', 'America/New_York')).toBe(
      '2030-07-01T13:00:00.000Z',
    )
    expect(localToInstant('2030-01-01T09:00', 'America/New_York')).toBe(
      '2030-01-01T14:00:00.000Z',
    )
    expect(localToInstant('2030-01-01T09:00', 'Asia/Kathmandu')).toBe(
      '2030-01-01T03:15:00.000Z',
    )
  })
  it('rejects DST gaps and ambiguous times', () => {
    expect(() =>
      localToInstant('2030-03-10T02:30', 'America/New_York'),
    ).toThrow('does not exist')
    expect(() =>
      localToInstant('2030-11-03T01:30', 'America/New_York'),
    ).toThrow('occurs twice')
  })
  it('rejects impossible calendar dates and malformed inputs', () => {
    for (const input of ['2030-02-30T09:00', '2030-01-01T25:00', 'invalid'])
      expect(() => localToInstant(input, 'UTC')).toThrow('valid date')
  })
  it('builds Monday-based weeks over month and year boundaries', () => {
    expect(calendarDays('2030-01-01', 'week')).toEqual([
      '2029-12-31',
      '2030-01-01',
      '2030-01-02',
      '2030-01-03',
      '2030-01-04',
      '2030-01-05',
      '2030-01-06',
    ])
    expect(calendarDays('2030-01-01', 'day')).toEqual(['2030-01-01'])
    expect(addDays('2032-02-28', 1)).toBe('2032-02-29')
  })
  it('uses 23-hour and 25-hour days across DST boundaries', () => {
    const span = (day: string) =>
      Date.parse(dayBoundary(addDays(day, 1), 'America/New_York')) -
      Date.parse(dayBoundary(day, 'America/New_York'))
    expect(span('2030-03-10')).toBe(23 * 3600000)
    expect(span('2030-11-03')).toBe(25 * 3600000)
  })
  it('finds midnight boundaries when daylight saving skips local midnight', () => {
    expect(dayBoundary('2026-09-06', 'America/Santiago')).toBe(
      '2026-09-06T04:00:00.000Z',
    )
  })
})

describe('appointment validation and permissions', () => {
  it('validates identifiers, dates, duration, initial status, and concurrency token', () => {
    expect(saveAppointmentSchema.safeParse(valid).success).toBe(true)
    for (const changes of [
      { branchId: '' },
      { duration: 0 },
      { duration: 481 },
      { duration: 5.5 },
      { id: branchId },
      { status: 'completed' },
    ])
      expect(
        saveAppointmentSchema.safeParse({ ...valid, ...changes }).success,
      ).toBe(false)
    expect(calendarSearchSchema.safeParse({ date: '2030-02-30' }).success).toBe(
      false,
    )
    expect(
      calendarSearchSchema.safeParse({ patient: 'x'.repeat(101) }).success,
    ).toBe(false)
  })
  it.each<StaffRole>([
    'administrator',
    'dentist',
    'receptionist',
    'dental_assistant',
    'billing_staff',
  ])('enforces %s scheduling permissions and branch scope', (role) => {
    const staff: StaffAccess = {
      id: 'staff',
      clinicId: 'clinic',
      displayName: 'Synthetic',
      isActive: true,
      assignments: [{ clinicId: 'clinic', branchId, role }],
    }
    expect(canManageAppointments(staff, branchId)).toBe(
      ['administrator', 'dentist', 'receptionist'].includes(role),
    )
    expect(canManageAppointments(staff, 'other')).toBe(false)
    expect(canManageAppointments({ ...staff, isActive: false }, branchId)).toBe(
      false,
    )
    expect(
      canManageAppointments(
        { ...staff, assignments: [{ clinicId: 'other', branchId, role }] },
        branchId,
      ),
    ).toBe(false)
  })
})

describe('scheduling boundary cases', () => {
  it('accepts both duration limits and preserves microsecond concurrency tokens', () => {
    for (const duration of [5, 480])
      expect(saveAppointmentSchema.parse({ ...valid, duration }).duration).toBe(
        duration,
      )
    const token = '2026-10-21T01:00:00.123456+00:00'
    expect(
      saveAppointmentSchema.parse({
        ...valid,
        id: branchId,
        expectedUpdatedAt: token,
      }).expectedUpdatedAt,
    ).toBe(token)
  })
  it.each([NaN, Infinity, -Infinity, -1, 4, 480.5])(
    'rejects invalid duration %s',
    (duration) => {
      expect(
        saveAppointmentSchema.safeParse({ ...valid, duration }).success,
      ).toBe(false)
    },
  )
  it('defaults search values, trims literal searches, and rejects malformed filters', () => {
    expect(calendarSearchSchema.parse({})).toEqual({
      view: 'week',
      branchId: '',
      dentistId: '',
      patient: '',
      status: '',
      page: 1,
    })
    expect(
      calendarSearchSchema.parse({ patient: '  50%_  ', page: '2' }),
    ).toMatchObject({ patient: '50%_', page: 2 })
    for (const input of [
      { page: 0 },
      { page: 1.5 },
      { page: 10001 },
      { view: 'month' },
      { status: 'deleted' },
      { dentistId: 'bad' },
      { branchId: 'bad' },
      { date: '2029-02-29' },
    ])
      expect(calendarSearchSchema.safeParse(input).success).toBe(false)
    expect(calendarSearchSchema.safeParse({ date: '2032-02-29' }).success).toBe(
      true,
    )
  })
  it('does not combine a read-only assignment with write permission at a different branch', () => {
    const staff: StaffAccess = {
      id: 'staff',
      clinicId: 'clinic',
      displayName: 'Synthetic',
      isActive: true,
      assignments: [
        { clinicId: 'clinic', branchId, role: 'dental_assistant' },
        { clinicId: 'clinic', branchId: 'other', role: 'receptionist' },
      ],
    }
    expect(canManageAppointments(staff)).toBe(true)
    expect(canManageAppointments(staff, branchId)).toBe(false)
    expect(canManageAppointments(staff, 'other')).toBe(true)
    expect(
      canManageAppointments(
        {
          ...staff,
          assignments: [
            { clinicId: 'clinic', branchId: null, role: 'administrator' },
          ],
        },
        branchId,
      ),
    ).toBe(true)
    expect(canManageAppointments({ ...staff, assignments: [] })).toBe(false)
  })
  it('handles half-hour daylight-saving shifts and a skipped calendar date', () => {
    expect(() =>
      localToInstant('2030-04-07T01:45', 'Australia/Lord_Howe'),
    ).toThrow('occurs twice')
    expect(() =>
      localToInstant('2030-10-06T02:15', 'Australia/Lord_Howe'),
    ).toThrow('does not exist')
    expect(() => localToInstant('2011-12-30T09:00', 'Pacific/Apia')).toThrow(
      'does not exist',
    )
    expect(dayBoundary('2011-12-30', 'Pacific/Apia')).toBe(
      dayBoundary('2011-12-31', 'Pacific/Apia'),
    )
  })
})
