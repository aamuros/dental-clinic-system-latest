import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { appointmentFixture } from '../support/appointment-fixture'
import type { AppointmentFixture } from '../support/appointment-fixture'

const test = base.extend<{ appointmentClinic: AppointmentFixture }>({
  appointmentClinic: async ({ baseURL }, provide) => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
    const fixture = await appointmentFixture()
    try {
      await provide(fixture)
    } finally {
      await fixture.cleanup()
    }
  },
})
async function signIn(
  page: Page,
  account: { email: string; password: string },
  date = '2090-05-01',
) {
  await page.goto('/login')
  // SSR renders actionable HTML before React hydrates. Wait for the form to
  // belong to React before submitting; otherwise native GET navigation wins.
  await page.waitForFunction(() =>
    Object.keys(document.querySelector('form') ?? {}).some((key) =>
      key.startsWith('__reactFiber$'),
    ),
  )
  await page.getByLabel('Work email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(`/appointments?date=${date}&view=day`)
  await page.waitForFunction(() =>
    Object.keys(document.querySelector('main') ?? {}).some((key) =>
      key.startsWith('__reactFiber$'),
    ),
  )
  await expect(
    page.getByRole('heading', { name: 'Appointments', exact: true }),
  ).toBeVisible()
}
async function fillBooking(
  page: Page,
  fixture: AppointmentFixture,
  localStart = '2090-05-01T09:00',
) {
  await page
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  await page
    .getByLabel('Patient', { exact: true })
    .selectOption(fixture.patientId)
  await page.getByLabel('Booking dentist').selectOption(fixture.dentist.id)
  await page.getByLabel('Date and time').fill(localStart)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
}
function visit(page: Page) {
  return page
    .getByRole('button', { name: /^View Visible Appointment Patient/ })
    .first()
}
async function seed(fixture: AppointmentFixture, local = '2090-05-01T01:00Z') {
  const result = await fixture.receptionist.client.rpc('save_appointment', {
    p_branch: fixture.branchId,
    p_patient: fixture.patientId,
    p_dentist: fixture.dentist.id,
    p_start: local,
    p_duration: 30,
    p_status: 'scheduled',
  })
  expect(result.error).toBeNull()
  return result.data!
}

test('books, views, confirms, reschedules, filters, cancels, and audits appointments', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await signIn(page, fixture.receptionist)
  await expect(
    page.getByRole('heading', { name: 'No appointments' }),
  ).toBeVisible()
  await fillBooking(page, fixture)
  await expect(
    page.getByRole('status').filter({ hasText: 'Appointment booked.' }),
  ).toBeVisible()
  const stored = await fixture.admin
    .from('appointments')
    .select('*')
    .eq('clinic_id', fixture.clinicId)
    .single()
  expect(stored.data?.starts_at).toBe('2090-05-01T01:00:00+00:00')
  await visit(page).click()
  await expect(page.getByRole('dialog')).toContainText('Appointment Branch A')
  await page
    .getByRole('button', { name: 'Reschedule or change status' })
    .click()
  await page.getByLabel('Appointment status').selectOption('confirmed')
  await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .click()
  await expect(
    page.getByText('Appointment updated.', { exact: true }),
  ).toBeVisible()
  await visit(page).click()
  await page
    .getByRole('button', { name: 'Reschedule or change status' })
    .click()
  await page.getByLabel('Date and time').fill('2090-05-01T10:00')
  await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .click()
  await expect(
    page.getByText('Appointment updated.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Week', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(visit(page)).toContainText('10:00')
  await page.getByLabel('Search patient').fill('missing')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(
    page.getByRole('heading', { name: 'No appointments' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByLabel('Search patient')).toHaveValue('')
  await page.getByLabel('Status', { exact: true }).selectOption('confirmed')
  await page
    .getByLabel('Branch', { exact: true })
    .selectOption(fixture.branchId)
  await page
    .getByLabel('Dentist', { exact: true })
    .selectOption(fixture.dentist.id)
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await visit(page).click()
  await page
    .getByRole('button', { name: 'Cancel appointment', exact: true })
    .click()
  await page.getByRole('button', { name: 'Yes, cancel appointment' }).click()
  await expect(
    page.getByText('Appointment cancelled.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(visit(page)).toContainText('Cancelled')
  await page.reload()
  await visit(page).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Cancelled appointments are read-only.',
  )
  const audits = await fixture.admin
    .from('audit_logs')
    .select('action,actor_staff_id')
    .eq('resource_id', stored.data!.id)
  expect(audits.data?.map((row) => row.action)).toEqual(
    expect.arrayContaining([
      'appointment.created',
      'appointment.updated',
      'appointment.rescheduled',
      'appointment.status_changed',
      'appointment.cancelled',
    ]),
  )
  expect(
    audits.data?.every((row) => row.actor_staff_id === fixture.receptionist.id),
  ).toBe(true)
  expect(runtimeErrors).toEqual([])
})

test('shows booking conflicts and rejects stale edits without losing another update', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const id = await seed(fixture)
  await signIn(page, fixture.receptionist)
  await fillBooking(page, fixture)
  await expect(page.getByRole('alert')).toContainText(
    'already has an appointment',
  )
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await visit(page).click()
  await page
    .getByRole('button', { name: 'Reschedule or change status' })
    .click()
  const row = await fixture.admin
    .from('appointments')
    .select('updated_at')
    .eq('id', id)
    .single()
  const update = await fixture.receptionist.client.rpc('save_appointment', {
    p_branch: fixture.branchId,
    p_patient: fixture.patientId,
    p_dentist: fixture.dentist.id,
    p_start: '2090-05-01T01:00Z',
    p_duration: 30,
    p_status: 'confirmed',
    p_id: id,
    p_expected_updated_at: row.data!.updated_at,
  })
  expect(update.error).toBeNull()
  await page.getByLabel('Date and time').fill('2090-05-01T11:00')
  await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('appointment has changed')
  const after = await fixture.admin
    .from('appointments')
    .select('status, starts_at')
    .eq('id', id)
    .single()
  expect(after.data?.status).toBe('confirmed')
  expect(after.data?.starts_at).toBe('2090-05-01T01:00:00+00:00')
})

test('keeps branch-only patients out of booking and gives assistants read-only access', async ({
  page,
  appointmentClinic: fixture,
}) => {
  await seed(fixture)
  await signIn(page, fixture.receptionist)
  await page
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  await expect(
    page
      .getByLabel('Patient', { exact: true })
      .getByRole('option', { name: /Visible/ }),
  ).toBeAttached()
  await expect(
    page
      .getByLabel('Patient', { exact: true })
      .getByRole('option', { name: /Hidden/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  const assistant = await fixture.staff('dental_assistant')
  await page.context().clearCookies()
  await signIn(page, assistant)
  await expect(
    page.getByRole('button', { name: 'Book appointment', exact: true }),
  ).toHaveCount(0)
  await visit(page).click()
  await expect(
    page.getByRole('button', { name: 'Reschedule or change status' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Cancel appointment', exact: true }),
  ).toHaveCount(0)
})

test('supports keyboard booking and a mobile calendar without page overflow', async ({
  page,
  appointmentClinic: fixture,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, fixture.receptionist)
  const book = page.getByRole('button', {
    name: 'Book appointment',
    exact: true,
  })
  await book.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(book).toBeFocused()
  await fillBooking(page, fixture)
  await expect(
    page.getByText('Appointment booked.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(visit(page)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('preserves a clearly selected patient when a new search no longer contains that patient', async ({
  page,
  appointmentClinic: fixture,
}) => {
  await signIn(page, fixture.receptionist)
  await page
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  await page
    .getByLabel('Patient', { exact: true })
    .selectOption(fixture.patientId)
  await page.getByLabel('Booking dentist').selectOption(fixture.dentist.id)
  await page.getByLabel('Find existing patient').fill('no such patient')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(
    page.getByText('No matching patients authorized at this branch.'),
  ).toBeVisible()
  // A hidden stale patient identifier must never remain submit-ready.
  await expect(page.getByLabel('Patient', { exact: true })).toHaveValue('')
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Book appointment', exact: true }),
  ).toBeDisabled()
})

test('completes appointments with second-level timestamps without changing their schedule', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const id = await seed(fixture)
  const originalStart = '2020-05-01T01:00:17.123456+00:00'
  const originalEnd = '2020-05-01T01:30:17.123456+00:00'
  expect(
    (
      await fixture.admin
        .from('appointments')
        .update({ starts_at: originalStart, ends_at: originalEnd })
        .eq('id', id)
    ).error,
  ).toBeNull()
  await signIn(page, fixture.receptionist, '2020-05-01')
  await visit(page).click()
  await page
    .getByRole('button', { name: 'Reschedule or change status' })
    .click()
  await page.getByLabel('Appointment status').selectOption('completed')
  await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .click()
  await expect(
    page.getByText('Appointment updated.', { exact: true }),
  ).toBeVisible()
  const stored = await fixture.admin
    .from('appointments')
    .select('status, starts_at, ends_at')
    .eq('id', id)
    .single()
  expect(stored.data).toEqual({
    status: 'completed',
    starts_at: originalStart,
    ends_at: originalEnd,
  })
  await visit(page).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Completed appointments are read-only.',
  )
  const audits = await fixture.admin
    .from('audit_logs')
    .select('action')
    .eq('resource_id', id)
  expect(audits.data?.map((row) => row.action)).not.toContain(
    'appointment.rescheduled',
  )
})

test('cancels the persisted appointment while discarding unsaved rescheduling edits', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const id = await seed(fixture)
  await signIn(page, fixture.receptionist)
  await visit(page).click()
  await page
    .getByRole('button', { name: 'Reschedule or change status' })
    .click()
  await page.getByLabel('Date and time').fill('2090-05-01T15:00')
  await page.getByLabel('Duration (minutes)').fill('45')
  await page
    .getByLabel('Booking dentist')
    .selectOption(fixture.secondDentist.id)
  await page
    .getByRole('button', { name: 'Cancel appointment', exact: true })
    .click()
  await page.getByRole('button', { name: 'Yes, cancel appointment' }).click()
  await expect(
    page.getByText('Appointment cancelled.', { exact: true }),
  ).toBeVisible()
  const row = await fixture.admin
    .from('appointments')
    .select('status,starts_at,ends_at,dentist_staff_id')
    .eq('id', id)
    .single()
  expect(row.data).toMatchObject({
    status: 'cancelled',
    starts_at: '2090-05-01T01:00:00+00:00',
    ends_at: '2090-05-01T01:30:00+00:00',
    dentist_staff_id: fixture.dentist.id,
  })
})

test('recovers a failed save request without writing or duplicating appointments', async ({
  page,
  appointmentClinic: fixture,
}) => {
  await signIn(page, fixture.receptionist)
  const intercept = '**/_serverFn/**'
  await page.route(intercept, async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await fillBooking(page, fixture)
  await expect(page.getByRole('alert')).toContainText(
    'Unable to save the appointment',
  )
  const before = await fixture.admin
    .from('appointments')
    .select('id')
    .eq('clinic_id', fixture.clinicId)
  expect(before.data).toEqual([])
  await page.unroute(intercept)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  await expect(
    page.getByText('Appointment booked.', { exact: true }),
  ).toBeVisible()
  const after = await fixture.admin
    .from('appointments')
    .select('id')
    .eq('clinic_id', fixture.clinicId)
  expect(after.data).toHaveLength(1)
})

test('clears branch-dependent selections and rejects a dentist deactivated after the panel opened', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const administrator = await fixture.staff('administrator')
  await signIn(page, administrator)
  await page
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  await page
    .getByLabel('Patient', { exact: true })
    .selectOption(fixture.patientId)
  await page
    .getByLabel('Booking dentist')
    .selectOption(fixture.secondDentist.id)
  await page.getByLabel('Booking branch').selectOption(fixture.otherBranchId)
  await expect(page.getByLabel('Patient', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Booking dentist')).toHaveValue('')
  await expect(
    page
      .getByLabel('Booking dentist')
      .getByRole('option', { name: 'Appointment dentist' }),
  ).toHaveCount(1)
  await page
    .getByLabel('Patient', { exact: true })
    .selectOption(fixture.hiddenPatientId)
  await page.getByLabel('Booking dentist').selectOption(fixture.dentist.id)
  expect(
    (
      await fixture.admin
        .from('staff_profiles')
        .update({ is_active: false })
        .eq('id', fixture.dentist.id)
    ).error,
  ).toBeNull()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('access has changed')
  expect(
    (
      await fixture.admin
        .from('appointments')
        .select('id')
        .eq('clinic_id', fixture.clinicId)
    ).data,
  ).toEqual([])
})

test('shows only the correct appointments on either side of local midnight', async ({
  page,
  appointmentClinic: fixture,
}) => {
  await seed(fixture, '2090-04-30T15:45Z')
  await seed(fixture, '2090-05-01T16:00Z')
  await signIn(page, fixture.receptionist)
  await expect(
    page.getByRole('button', { name: /^View Visible Appointment Patient/ }),
  ).toHaveCount(1)
  await expect(visit(page)).toContainText('Continues from previous day')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(
    '2090-05-02',
  )
  await expect(
    page.getByRole('button', { name: /^View Visible Appointment Patient/ }),
  ).toHaveCount(1)
  await expect(visit(page)).not.toContainText('Continues from previous day')
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(visit(page)).toContainText('Continues from previous day')
})

test('paginates a busy calendar and resets pagination when filtering', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const start = Date.parse('2090-05-01T01:00Z')
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: randomUUID(),
    clinic_id: fixture.clinicId,
    branch_id: fixture.branchId,
    patient_id: fixture.patientId,
    dentist_staff_id: fixture.dentist.id,
    starts_at: new Date(start + index * 5 * 60000).toISOString(),
    ends_at: new Date(start + (index + 1) * 5 * 60000).toISOString(),
    status: index === 100 ? ('confirmed' as const) : ('scheduled' as const),
  }))
  expect(
    (await fixture.admin.from('appointments').insert(rows)).error,
  ).toBeNull()
  await signIn(page, fixture.receptionist)
  await expect(
    page.getByRole('button', { name: /^View Visible Appointment Patient/ }),
  ).toHaveCount(100)
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByText(/Showing page 2 of 2/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^View Visible Appointment Patient/ }),
  ).toHaveCount(1)
  await page.getByLabel('Status', { exact: true }).selectOption('confirmed')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/page=1/)
  await expect(visit(page)).toContainText('Confirmed')
  await expect(
    page.getByRole('navigation', { name: 'Appointment pages' }),
  ).toHaveCount(0)
})

test('updates confirmed status options when scheduling details change and are restored', async ({
  page,
  appointmentClinic: fixture,
}) => {
  const id = await seed(fixture)
  const row = await fixture.admin
    .from('appointments')
    .select('updated_at')
    .eq('id', id)
    .single()
  expect(
    (
      await fixture.receptionist.client.rpc('save_appointment', {
        p_branch: fixture.branchId,
        p_patient: fixture.patientId,
        p_dentist: fixture.dentist.id,
        p_start: '2090-05-01T01:00Z',
        p_duration: 30,
        p_status: 'confirmed',
        p_id: id,
        p_expected_updated_at: row.data!.updated_at,
      })
    ).error,
  ).toBeNull()
  await signIn(page, fixture.receptionist)
  await visit(page).click()
  await page
    .getByRole('button', { name: 'Reschedule or change status' })
    .click()
  const status = page.getByLabel('Appointment status')
  const scheduled = status.getByRole('option', {
    name: 'Scheduled',
    exact: true,
  })
  await expect(scheduled).toHaveCount(0)
  await expect(
    page.getByText('To select Scheduled,', { exact: false }),
  ).toBeVisible()
  for (const [label, changed, original] of [
    ['Date and time', '2090-05-01T10:00', '2090-05-01T09:00'],
    ['Duration (minutes)', '45', '30'],
  ]) {
    await page.getByLabel(label!).fill(changed!)
    await expect(scheduled).toBeAttached()
    await status.selectOption('scheduled')
    await page.getByLabel(label!).fill(original!)
    await expect(scheduled).toHaveCount(0)
    await expect(status).toHaveValue('confirmed')
  }
  await page
    .getByLabel('Booking dentist')
    .selectOption(fixture.secondDentist.id)
  await status.selectOption('scheduled')
  await page.getByLabel('Booking dentist').selectOption(fixture.dentist.id)
  await expect(status).toHaveValue('confirmed')
  await expect(scheduled).toHaveCount(0)
  await page.getByLabel('Date and time').fill('2090-05-01T10:00')
  await status.selectOption('scheduled')
  await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .click()
  await expect(
    page.getByText('Appointment updated.', { exact: true }),
  ).toBeVisible()
  const stored = await fixture.admin
    .from('appointments')
    .select('status, starts_at')
    .eq('id', id)
    .single()
  expect(stored.data).toEqual({
    status: 'scheduled',
    starts_at: '2090-05-01T02:00:00+00:00',
  })
})

test('normalizes phone searches in booking selection and calendar filtering', async ({
  page,
  appointmentClinic: fixture,
}) => {
  expect(
    (
      await fixture.admin
        .from('patients')
        .update({ phone: '+63 (917) 123-4567' })
        .in('id', [fixture.patientId, fixture.hiddenPatientId])
    ).error,
  ).toBeNull()
  await seed(fixture)
  await signIn(page, fixture.receptionist)
  await page
    .getByRole('button', { name: 'Book appointment', exact: true })
    .click()
  for (const query of ['9171234567', '917 123 4567', '1234567']) {
    await page.getByLabel('Find existing patient').fill(query)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const options = page.getByLabel('Patient', { exact: true })
    await expect(
      options.getByRole('option', { name: /Visible/ }),
    ).toBeAttached()
    await expect(options.getByRole('option', { name: /Hidden/ })).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  for (const [query, count] of [
    ['9171234567', 1],
    ['917 123 4567', 1],
    ['1234567', 1],
    ['0917', 0],
    ['123%', 0],
  ] as const) {
    await page.getByLabel('Search patient', { exact: true }).fill(query)
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await expect(
      page.getByRole('button', { name: /^View Visible Appointment Patient/ }),
    ).toHaveCount(count)
  }
})
