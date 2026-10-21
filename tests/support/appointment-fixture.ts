import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { StaffRole } from '@/types/auth'

export function appointmentTestConfig() {
  const config = JSON.parse(
    execFileSync(
      'supabase',
      [
        'status',
        '--output',
        'json',
        ...(process.env.APPOINTMENT_SUPABASE_WORKDIR
          ? ['--workdir', process.env.APPOINTMENT_SUPABASE_WORKDIR]
          : []),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  ) as { API_URL: string; SECRET_KEY: string; PUBLISHABLE_KEY: string }
  const url = new URL(config.API_URL)
  assert(
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
      ['55321', '56321'].includes(url.port),
    'Appointment fixtures require a local dental Supabase stack.',
  )
  assert(
    config.SECRET_KEY.startsWith('sb_secret_') &&
      config.PUBLISHABLE_KEY.startsWith('sb_publishable_'),
  )
  return config
}

export async function appointmentFixture() {
  const config = appointmentTestConfig()
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient<Database>(
    config.API_URL,
    config.SECRET_KEY,
    options,
  )
  const clinicId = randomUUID(),
    branchId = randomUUID(),
    otherBranchId = randomUUID(),
    patientId = randomUUID(),
    hiddenPatientId = randomUUID()
  const userIds: string[] = []
  function checked(result: { error: unknown }) {
    assert(!result.error, JSON.stringify(result.error))
  }
  async function staff(role: StaffRole, bothBranches = false) {
    const email = `appointment-${randomUUID()}@example.invalid`,
      password = `${randomUUID()}-Synthetic!`
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    checked(result)
    assert(result.data.user)
    const id = result.data.user.id
    userIds.push(id)
    checked(
      await admin.from('staff_profiles').insert({
        id,
        clinic_id: clinicId,
        display_name: `Appointment ${role}`,
      }),
    )
    checked(
      await admin.from('staff_role_assignments').insert(
        (bothBranches
          ? [branchId, otherBranchId]
          : [role === 'administrator' ? null : branchId]
        ).map((branch) => ({
          staff_id: id,
          clinic_id: clinicId,
          branch_id: branch,
          role,
        })),
      ),
    )
    const client = createClient<Database>(
      config.API_URL,
      config.PUBLISHABLE_KEY,
      options,
    )
    checked(await client.auth.signInWithPassword({ email, password }))
    return { id, email, password, client }
  }
  async function cleanup() {
    for (const table of [
      'appointments',
      'audit_logs',
      'patient_branch_access',
      'patients',
      'staff_role_assignments',
      'staff_profiles',
      'branches',
    ] as const)
      checked(await admin.from(table).delete().eq('clinic_id', clinicId))
    for (const id of userIds) checked(await admin.auth.admin.deleteUser(id))
    checked(await admin.from('clinics').delete().eq('id', clinicId))
  }
  try {
    checked(
      await admin.from('clinics').insert({
        id: clinicId,
        name: 'Synthetic Appointment Clinic',
        timezone: 'Asia/Manila',
      }),
    )
    checked(
      await admin.from('branches').insert([
        { id: branchId, clinic_id: clinicId, name: 'Appointment Branch A' },
        {
          id: otherBranchId,
          clinic_id: clinicId,
          name: 'Appointment Branch B',
        },
      ]),
    )
    checked(
      await admin.from('patients').insert([
        {
          id: patientId,
          clinic_id: clinicId,
          first_name: 'Visible',
          last_name: 'Appointment Patient',
        },
        {
          id: hiddenPatientId,
          clinic_id: clinicId,
          first_name: 'Hidden',
          last_name: 'Appointment Patient',
        },
      ]),
    )
    checked(
      await admin.from('patient_branch_access').insert([
        { patient_id: patientId, clinic_id: clinicId, branch_id: branchId },
        {
          patient_id: patientId,
          clinic_id: clinicId,
          branch_id: otherBranchId,
        },
        {
          patient_id: hiddenPatientId,
          clinic_id: clinicId,
          branch_id: otherBranchId,
        },
      ]),
    )
    const receptionist = await staff('receptionist')
    const dentist = await staff('dentist', true)
    const secondDentist = await staff('dentist')
    return {
      config,
      admin,
      clinicId,
      branchId,
      otherBranchId,
      patientId,
      hiddenPatientId,
      receptionist,
      dentist,
      secondDentist,
      staff,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}
export type AppointmentFixture = Awaited<ReturnType<typeof appointmentFixture>>
