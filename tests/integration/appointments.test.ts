import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appointmentFixture } from '../support/appointment-fixture'
import type { AppointmentFixture } from '../support/appointment-fixture'
import type { Database } from '@/types/database'
import { createClient } from '@supabase/supabase-js'

let fixture: AppointmentFixture
beforeAll(async () => {
  fixture = await appointmentFixture()
})
afterAll(async () => {
  await fixture?.cleanup()
})
type BookingInput = Database['public']['Functions']['save_appointment']['Args']
function booking(
  start: string,
  changes: Partial<BookingInput> = {},
): BookingInput {
  return {
    p_branch: fixture.branchId,
    p_patient: fixture.patientId,
    p_dentist: fixture.dentist.id,
    p_start: start,
    p_duration: 30,
    p_status: 'scheduled' as const,
    ...changes,
  }
}
async function current(id: string) {
  const result = await fixture.admin
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single()
  expect(result.error).toBeNull()
  return result.data!
}
describe('real authenticated appointment RPC integration', () => {
  it('allows exactly one winner for concurrent overlapping requests in different branches', async () => {
    const results = await Promise.all([
      fixture.receptionist.client.rpc(
        'save_appointment',
        booking('2090-04-01T01:00Z'),
      ),
      fixture.dentist.client.rpc(
        'save_appointment',
        booking('2090-04-01T01:15Z', { p_branch: fixture.otherBranchId }),
      ),
    ])
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(results.find((result) => result.error)?.error?.code).toBe('23P01')
    const ids = results
      .filter((result) => !result.error)
      .map((result) => result.data!)
    const audits = await fixture.admin
      .from('audit_logs')
      .select('action')
      .in('resource_id', ids)
    expect(audits.data).toEqual([{ action: 'appointment.created' }])
  })
  it('allows simultaneous bookings for distinct dentists and adjacent appointments', async () => {
    const results = await Promise.all([
      fixture.receptionist.client.rpc(
        'save_appointment',
        booking('2090-04-02T01:00Z'),
      ),
      fixture.receptionist.client.rpc(
        'save_appointment',
        booking('2090-04-02T01:00Z', { p_dentist: fixture.secondDentist.id }),
      ),
    ])
    expect(results.every((result) => !result.error)).toBe(true)
    expect(
      (
        await fixture.receptionist.client.rpc(
          'save_appointment',
          booking('2090-04-02T01:30Z'),
        )
      ).error,
    ).toBeNull()
  })
  it('rejects one of two concurrent reschedules into the same slot without partial audits', async () => {
    const first = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-04-03T01:00Z'),
    )
    const second = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-04-03T02:00Z'),
    )
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const rows = await Promise.all([
      current(first.data!),
      current(second.data!),
    ])
    const results = await Promise.all(
      rows.map((row) =>
        fixture.receptionist.client.rpc(
          'save_appointment',
          booking('2090-04-03T03:00Z', {
            p_id: row.id,
            p_expected_updated_at: row.updated_at,
          }),
        ),
      ),
    )
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(results.find((result) => result.error)?.error?.code).toBe('23P01')
    const audits = await fixture.admin
      .from('audit_logs')
      .select('action')
      .in(
        'resource_id',
        rows.map((row) => row.id),
      )
    expect(audits.data?.map((row) => row.action).sort()).toEqual([
      'appointment.created',
      'appointment.created',
      'appointment.rescheduled',
      'appointment.updated',
    ])
  })
  it('rejects a stale concurrent status update and releases a cancelled slot', async () => {
    const saved = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-04-04T01:00Z'),
    )
    expect(saved.error).toBeNull()
    const row = await current(saved.data!)
    const results = await Promise.all(
      (['confirmed', 'cancelled'] as const).map((status) =>
        fixture.receptionist.client.rpc(
          'save_appointment',
          booking('2090-04-04T01:00Z', {
            p_id: row.id,
            p_expected_updated_at: row.updated_at,
            p_status: status,
          }),
        ),
      ),
    )
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(results.find((result) => result.error)?.error?.code).toBe('PT409')
    const updated = await current(row.id)
    if (updated.status !== 'cancelled')
      expect(
        (
          await fixture.receptionist.client.rpc(
            'save_appointment',
            booking('2090-04-04T01:00Z', {
              p_id: row.id,
              p_expected_updated_at: updated.updated_at,
              p_status: 'cancelled',
            }),
          )
        ).error,
      ).toBeNull()
    expect(
      (
        await fixture.receptionist.client.rpc(
          'save_appointment',
          booking('2090-04-04T01:00Z'),
        )
      ).error,
    ).toBeNull()
  })
  it('enforces branch-patient authorization through the actual API and denies direct writes', async () => {
    const result = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-04-05T01:00Z', { p_patient: fixture.hiddenPatientId }),
    )
    expect(result.error?.code).toBe('42501')
    const direct = await fixture.receptionist.client
      .from('appointments')
      .insert({
        clinic_id: fixture.clinicId,
        branch_id: fixture.branchId,
        patient_id: fixture.patientId,
        dentist_staff_id: fixture.dentist.id,
        starts_at: '2090-04-05T01:00Z',
        ends_at: '2090-04-05T01:30Z',
      })
    expect(direct.error?.code).toBe('42501')
    const before = await fixture.admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', fixture.clinicId)
    expect(before.error).toBeNull()
    expect(before.count).toBeGreaterThan(0)
  })
})

describe('calendar, mutation, and authorization edge cases over the real API', () => {
  it('includes cross-midnight visits and excludes appointments exactly outside a day', async () => {
    const inputs = [
      booking('2090-06-01T15:45Z', { p_duration: 30 }),
      booking('2090-06-02T15:30Z', { p_duration: 30 }),
      booking('2090-06-02T16:00Z', { p_duration: 30 }),
    ]
    const saved = await Promise.all(
      inputs.map((input) =>
        fixture.receptionist.client.rpc('save_appointment', input),
      ),
    )
    expect(saved.every((result) => !result.error)).toBe(true)
    const result = await fixture.receptionist.client.rpc(
      'appointment_schedule',
      { p_from: '2090-06-01T16:00Z', p_to: '2090-06-02T16:00Z' },
    )
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({
      total: 2,
      appointments: [
        expect.objectContaining({ id: saved[0]!.data }),
        expect.objectContaining({ id: saved[1]!.data }),
      ],
    })
  })
  it('paginates tied start times deterministically and returns empty pages with the correct total', async () => {
    const start = Date.parse('2090-06-03T01:00Z')
    const rows = Array.from({ length: 101 }, (_, index) => ({
      clinic_id: fixture.clinicId,
      branch_id: fixture.branchId,
      patient_id: fixture.patientId,
      dentist_staff_id: fixture.dentist.id,
      starts_at: new Date(start + index * 5 * 60000).toISOString(),
      ends_at: new Date(start + (index + 1) * 5 * 60000).toISOString(),
    }))
    rows.push({ ...rows[0]!, dentist_staff_id: fixture.secondDentist.id })
    expect(
      (await fixture.admin.from('appointments').insert(rows)).error,
    ).toBeNull()
    const pages = await Promise.all(
      [1, 2, 3, 1].map((page) =>
        fixture.receptionist.client.rpc('appointment_schedule', {
          p_from: '2090-06-03T00:00Z',
          p_to: '2090-06-04T00:00Z',
          p_page: page,
        }),
      ),
    )
    expect(pages.every((result) => !result.error)).toBe(true)
    const data = pages.map(
      (result) =>
        result.data as { total: number; appointments: { id: string }[] },
    )
    expect(data.map((result) => result.total)).toEqual([102, 102, 102, 102])
    expect(data.map((result) => result.appointments.length)).toEqual([
      100, 2, 0, 100,
    ])
    expect(data[0]).toEqual(data[3])
    expect(
      new Set(
        [...data[0]!.appointments, ...data[1]!.appointments].map(
          (row) => row.id,
        ),
      ).size,
    ).toBe(102)
  })
  it('requires source-branch permission when moving a known appointment identifier', async () => {
    const saved = await fixture.dentist.client.rpc(
      'save_appointment',
      booking('2090-06-04T01:00Z', { p_branch: fixture.otherBranchId }),
    )
    expect(saved.error).toBeNull()
    const row = await current(saved.data!)
    const move = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-06-04T02:00Z', {
        p_id: row.id,
        p_expected_updated_at: row.updated_at,
      }),
    )
    expect(move.error?.code).toBe('42501')
    expect((await current(row.id)).branch_id).toBe(fixture.otherBranchId)
    const allowed = await fixture.dentist.client.rpc(
      'save_appointment',
      booking('2090-06-04T02:00Z', {
        p_id: row.id,
        p_expected_updated_at: row.updated_at,
      }),
    )
    expect(allowed.error).toBeNull()
    const events = await fixture.admin
      .from('audit_logs')
      .select('action,branch_id,actor_staff_id')
      .eq('resource_id', row.id)
    expect(events.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'appointment.moved',
          branch_id: fixture.otherBranchId,
          actor_staff_id: fixture.dentist.id,
        }),
        expect.objectContaining({
          action: 'appointment.rescheduled',
          branch_id: fixture.branchId,
        }),
      ]),
    )
  })
  it('allows exact duration limits and rejects invalid requests without adding appointments or audit events', async () => {
    for (const [day, duration] of [
      [5, 5],
      [6, 480],
    ]) {
      expect(
        (
          await fixture.receptionist.client.rpc(
            'save_appointment',
            booking(`2090-06-0${day}T01:00Z`, { p_duration: duration }),
          )
        ).error,
      ).toBeNull()
    }
    const before = await fixture.admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', fixture.clinicId)
    const attempts: Partial<BookingInput>[] = [
      { p_duration: 4 },
      { p_duration: 481 },
      { p_start: '2000-01-01T01:00Z' },
      { p_status: 'confirmed' },
      { p_patient: fixture.hiddenPatientId },
    ]
    for (const changes of attempts)
      expect(
        (
          await fixture.receptionist.client.rpc(
            'save_appointment',
            booking('2090-06-07T01:00Z', changes),
          )
        ).error,
      ).not.toBeNull()
    const after = await fixture.admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', fixture.clinicId)
    expect(after.error).toBeNull()
    expect(after.count).toBe(before.count)
    const rows = await fixture.admin
      .from('appointments')
      .select('id')
      .eq('clinic_id', fixture.clinicId)
      .eq('starts_at', '2090-06-07T01:00Z')
    expect(rows.data).toEqual([])
  })
  it('rejects a previously selected dentist whose assignment has been revoked', async () => {
    const removal = await fixture.admin
      .from('staff_role_assignments')
      .delete()
      .eq('staff_id', fixture.secondDentist.id)
      .eq('branch_id', fixture.branchId)
      .eq('role', 'dentist')
    expect(removal.error).toBeNull()
    try {
      const result = await fixture.receptionist.client.rpc(
        'save_appointment',
        booking('2090-06-08T01:00Z', { p_dentist: fixture.secondDentist.id }),
      )
      expect(result.error?.code).toBe('42501')
    } finally {
      expect(
        (
          await fixture.admin.from('staff_role_assignments').insert({
            staff_id: fixture.secondDentist.id,
            clinic_id: fixture.clinicId,
            branch_id: fixture.branchId,
            role: 'dentist',
          })
        ).error,
      ).toBeNull()
    }
  })
  it('revokes existing JWT access immediately when a staff profile is deactivated', async () => {
    expect(
      (
        await fixture.admin
          .from('staff_profiles')
          .update({ is_active: false })
          .eq('id', fixture.receptionist.id)
      ).error,
    ).toBeNull()
    try {
      const read = await fixture.receptionist.client.rpc(
        'appointment_schedule',
        { p_from: '2090-04-02T00:00Z', p_to: '2090-04-03T00:00Z' },
      )
      expect(read.error).toBeNull()
      expect(read.data).toEqual({ appointments: [], total: 0 })
      expect(
        (
          await fixture.receptionist.client.rpc(
            'save_appointment',
            booking('2090-06-09T01:00Z'),
          )
        ).error?.code,
      ).toBe('42501')
    } finally {
      expect(
        (
          await fixture.admin
            .from('staff_profiles')
            .update({ is_active: true })
            .eq('id', fixture.receptionist.id)
        ).error,
      ).toBeNull()
    }
  })
  it('does not let anonymous clients call appointment RPCs', async () => {
    const anonymous = createClient<Database>(
      fixture.config.API_URL,
      fixture.config.PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    expect((await anonymous.rpc('appointment_dentists')).error?.code).toBe(
      '42501',
    )
    expect(
      (await anonymous.rpc('save_appointment', booking('2090-06-10T01:00Z')))
        .error?.code,
    ).toBe('42501')
  })
  it('isolates another clinic, including direct RLS reads and known appointment identifiers', async () => {
    const other = await appointmentFixture()
    try {
      const saved = await other.receptionist.client.rpc('save_appointment', {
        p_branch: other.branchId,
        p_patient: other.patientId,
        p_dentist: other.dentist.id,
        p_start: '2090-06-11T01:00Z',
        p_duration: 30,
        p_status: 'scheduled',
      })
      expect(saved.error).toBeNull()
      const row = await other.admin
        .from('appointments')
        .select('updated_at')
        .eq('id', saved.data!)
        .single()
      const read = await fixture.receptionist.client
        .from('appointments')
        .select('id')
        .eq('id', saved.data!)
      expect(read.error).toBeNull()
      expect(read.data).toEqual([])
      const mutation = await fixture.receptionist.client.rpc(
        'save_appointment',
        booking('2090-06-11T02:00Z', {
          p_id: saved.data!,
          p_expected_updated_at: row.data!.updated_at,
        }),
      )
      expect(mutation.error?.code).toBe('42501')
      const lookup = await fixture.receptionist.client.rpc(
        'appointment_patients',
        { p_branch: other.branchId },
      )
      expect(lookup.data).toEqual({ patients: [], hasMore: false })
    } finally {
      await other.cleanup()
    }
  })
  it('never treats user-editable role metadata as scheduling authorization', async () => {
    const billing = await fixture.staff('billing_staff')
    expect(
      (
        await billing.client.auth.updateUser({
          data: { role: 'administrator' },
        })
      ).error,
    ).toBeNull()
    const rows = await billing.client.rpc('appointment_schedule', {
      p_from: '2090-04-02T00:00Z',
      p_to: '2090-04-03T00:00Z',
    })
    expect(rows.data).toEqual({ appointments: [], total: 0 })
    expect(
      (
        await billing.client.rpc(
          'save_appointment',
          booking('2090-06-12T01:00Z'),
        )
      ).error?.code,
    ).toBe('42501')
  })
  it('caps patient choices and finds patients beyond the first result page with literal searches', async () => {
    const patients = Array.from({ length: 22 }, (_, index) => ({
      clinic_id: fixture.clinicId,
      first_name: 'Directory',
      last_name: `Patient ${String(index).padStart(2, '0')}`,
    }))
    const inserted = await fixture.admin
      .from('patients')
      .insert(patients)
      .select('id')
    expect(inserted.error).toBeNull()
    expect(
      (
        await fixture.admin.from('patient_branch_access').insert(
          inserted.data!.map((patient) => ({
            clinic_id: fixture.clinicId,
            branch_id: fixture.branchId,
            patient_id: patient.id,
          })),
        )
      ).error,
    ).toBeNull()
    const first = await fixture.receptionist.client.rpc(
      'appointment_patients',
      { p_branch: fixture.branchId, p_query: 'Directory' },
    )
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ hasMore: true })
    expect((first.data as { patients: unknown[] }).patients).toHaveLength(20)
    const last = await fixture.receptionist.client.rpc('appointment_patients', {
      p_branch: fixture.branchId,
      p_query: 'Directory Patient 21',
    })
    expect(last.data).toMatchObject({
      patients: [{ id: inserted.data![21]!.id }],
      hasMore: false,
    })
  })
})

describe('database conflict enforcement under contention', () => {
  it('returns one successful booking and useful conflicts for a burst of overlapping requests', async () => {
    const start = Date.parse('2090-07-01T01:00Z')
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        fixture.receptionist.client.rpc(
          'save_appointment',
          booking(new Date(start + index * 60000).toISOString()),
        ),
      ),
    )
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(
      results
        .filter((result) => result.error)
        .map((result) => result.error!.code),
    ).toEqual(Array(7).fill('23P01'))
    const winner = results.find((result) => !result.error)!.data!
    const audit = await fixture.admin
      .from('audit_logs')
      .select('action')
      .eq('resource_id', winner)
    expect(audit.data).toEqual([{ action: 'appointment.created' }])
  })
  it('orders old and new dentist locks consistently during simultaneous swap attempts', async () => {
    const first = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-07-02T01:00Z'),
    )
    const second = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-07-02T01:00Z', { p_dentist: fixture.secondDentist.id }),
    )
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const rows = await Promise.all([
      current(first.data!),
      current(second.data!),
    ])
    const results = await Promise.all(
      rows.map((row, index) =>
        fixture.receptionist.client.rpc(
          'save_appointment',
          booking('2090-07-02T01:00Z', {
            p_id: row.id,
            p_expected_updated_at: row.updated_at,
            p_dentist:
              index === 0 ? fixture.secondDentist.id : fixture.dentist.id,
          }),
        ),
      ),
    )
    expect(results.map((result) => result.error?.code)).toEqual([
      '23P01',
      '23P01',
    ])
    expect((await current(rows[0]!.id)).dentist_staff_id).toBe(
      fixture.dentist.id,
    )
    expect((await current(rows[1]!.id)).dentist_staff_id).toBe(
      fixture.secondDentist.id,
    )
  })
  it('enforces the exclusion constraint even for privileged writes bypassing the booking RPC', async () => {
    const created = await fixture.receptionist.client.rpc(
      'save_appointment',
      booking('2090-07-03T01:00Z'),
    )
    expect(created.error).toBeNull()
    const result = await fixture.admin.from('appointments').insert({
      clinic_id: fixture.clinicId,
      branch_id: fixture.otherBranchId,
      patient_id: fixture.patientId,
      dentist_staff_id: fixture.dentist.id,
      starts_at: '2090-07-03T01:15Z',
      ends_at: '2090-07-03T01:45Z',
    })
    expect(result.error?.code).toBe('23P01')
  })
})
