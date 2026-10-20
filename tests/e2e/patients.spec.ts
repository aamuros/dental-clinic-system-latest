import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import type { LocalClinic } from './fixtures'
import type { Database } from '@/types/database'

type PatientSeed = Partial<
  Database['public']['Tables']['patients']['Insert']
> & { branchId?: string }

async function seedPatients(clinic: LocalClinic, values: PatientSeed[]) {
  const rows = values.map(({ branchId, ...value }) => ({
    id: randomUUID(),
    clinic_id: clinic.id,
    first_name: 'Synthetic',
    last_name: 'Patient',
    created_at: new Date().toISOString(),
    ...value,
    branchId: branchId ?? clinic.branchId,
  }))
  const patients = await clinic.admin.from('patients').insert(
    rows.map(({ branchId, ...row }) => {
      expect(
        branchId,
        'Synthetic patients require an explicit branch',
      ).toBeTruthy()
      return row
    }),
  )
  expect(patients.error).toBeNull()
  const links = await clinic.admin.from('patient_branch_access').insert(
    rows.map((row) => ({
      patient_id: row.id,
      clinic_id: clinic.id,
      branch_id: row.branchId,
    })),
  )
  expect(links.error).toBeNull()
  return rows
}

async function fillIdentity(
  page: Page,
  firstName = 'Ana',
  lastName = 'Santos',
) {
  await page.getByLabel('First name').fill(firstName)
  await page.getByLabel('Last name').fill(lastName)
}

function currentPatientId(page: Page) {
  const id = new URL(page.url()).pathname.split('/').at(-1)
  expect(id).toMatch(/^[a-f0-9-]{36}$/)
  return id!
}

test('registers, validates, edits, and audits a complete patient profile', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  const staff = await createStaff({ roles: ['receptionist'] })
  await signIn(staff)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/patients')
  await expect(
    page.getByRole('heading', { name: 'No patients yet' }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Register patient', exact: true })
    .first()
    .click()
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click()
  await expect(page.getByText('Enter a first name.')).toBeVisible()
  await expect(page.getByText('Enter a last name.')).toBeVisible()
  await fillIdentity(page)
  await page.getByLabel('Middle name').fill('Maria')
  await page.getByLabel('Birth date').fill('2000-02-29')
  await page.getByLabel('Gender', { exact: true }).selectOption('female')
  await page.getByLabel('Phone', { exact: true }).fill('+63 917 123 4567')
  await page.getByLabel('Email', { exact: true }).fill('ana@example.test')
  await page.getByLabel('Address', { exact: true }).fill('Synthetic address')
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click()
  await expect(page.getByText('Patient registered successfully.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Ana Maria Santos', exact: true }),
  ).toBeVisible()
  const id = currentPatientId(page)
  const stored = await clinic.admin
    .from('patients')
    .select('*')
    .eq('id', id)
    .single()
  expect(stored.error).toBeNull()
  expect(stored.data).toMatchObject({
    clinic_id: clinic.id,
    first_name: 'Ana',
    middle_name: 'Maria',
    last_name: 'Santos',
    birth_date: '2000-02-29',
    gender: 'female',
    phone: '+63 917 123 4567',
    email: 'ana@example.test',
    address: 'Synthetic address',
  })
  await page.getByRole('link', { name: 'Edit patient' }).click()
  await expect(
    page.getByRole('navigation', { name: 'Breadcrumb' }),
  ).toContainText('Patients')
  await expect(page.getByLabel('First name')).toHaveValue('Ana')
  await page.getByLabel('Phone', { exact: true }).fill('+63 918 765 4321')
  await page
    .getByLabel('Address', { exact: true })
    .fill('Updated synthetic address')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Patient updated successfully.')).toBeVisible()
  await expect(
    page.getByText('+63 918 765 4321', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByText('Updated synthetic address', { exact: true }),
  ).toBeVisible()
  const audit = await clinic.admin
    .from('audit_logs')
    .select('action, actor_staff_id, clinic_id, branch_id')
    .eq('resource_id', id)
  expect(audit.error).toBeNull()
  expect(audit.data?.map((event) => event.action).sort()).toEqual([
    'patient.branch_assigned',
    'patient.created',
    'patient.updated',
  ])
  expect(
    audit.data?.every(
      (event) =>
        event.actor_staff_id === staff.id && event.clinic_id === clinic.id,
    ),
  ).toBe(true)
  expect(
    audit.data?.find((event) => event.action === 'patient.branch_assigned')
      ?.branch_id,
  ).toBe(clinic.branchId)
})

test('warns about duplicates without writing until explicitly confirmed', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  const [existing] = await seedPatients(clinic, [
    { first_name: 'Ana', last_name: 'Santos', birth_date: '2000-02-29' },
  ])
  await signIn(await createStaff({ roles: ['receptionist'] }))
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/patients/new')
  await fillIdentity(page, 'ana', 'santos')
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Possible duplicate patient',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Ana Santos', exact: true }),
  ).toHaveAttribute('href', `/patients/${existing!.id}`)
  const before = await clinic.admin
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.id)
  expect(before.count).toBe(1)
  await page.getByRole('button', { name: 'Save as a separate patient' }).click()
  await expect(page.getByText('Patient registered successfully.')).toBeVisible()
  const after = await clinic.admin
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.id)
  expect(after.count).toBe(2)
})

test('searches, sorts, paginates, and filters the directory by branch', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  await seedPatients(clinic, [
    ...Array.from({ length: 21 }, (_, index) => ({
      first_name: 'Directory',
      last_name: `Patient ${String(index + 1).padStart(2, '0')}`,
      email: `directory${String(index + 1).padStart(2, '0')}@example.test`,
      created_at: `2020-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    })),
    {
      first_name: 'Other',
      last_name: 'BranchOnly',
      branchId: clinic.otherBranchId,
    },
  ])
  await signIn(await createStaff())
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/patients')
  await expect(page.getByText('22 patients', { exact: true })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(21)
  await page.getByLabel('Branch', { exact: true }).selectOption(clinic.branchId)
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('21 patients', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2', { exact: false })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(
    page.getByRole('link', { name: 'Patient 21, Directory' }),
  ).toBeVisible()
  await page.getByLabel('Sort by').selectOption('newest')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('Page 1 of 2', { exact: false })).toBeVisible()
  await expect(page.getByRole('row').nth(1)).toContainText(
    'Patient 21, Directory',
  )
  await page
    .getByRole('searchbox', { name: 'Search patients' })
    .fill('directory05@example.test')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('1 patient', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Patient 05, Directory' }),
  ).toBeVisible()
  await page
    .getByRole('searchbox', { name: 'Search patients' })
    .fill('missing patient')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'No matching patients' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Clear filters' }).click()
  await expect(page.getByText('22 patients', { exact: true })).toBeVisible()
  await page
    .getByLabel('Branch', { exact: true })
    .selectOption(clinic.otherBranchId)
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'BranchOnly, Other' }),
  ).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2)
})

test('hides other-branch patients and rejects direct profile access', async ({
  page,
  clinic,
  createStaff,
  signIn,
  expected404s,
}) => {
  const [, hidden] = await seedPatients(clinic, [
    { first_name: 'Visible', last_name: 'Patient' },
    {
      first_name: 'Hidden',
      last_name: 'Patient',
      branchId: clinic.otherBranchId,
    },
  ])
  await signIn(await createStaff({ roles: ['receptionist'] }))
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/patients')
  await expect(
    page.getByRole('link', { name: 'Patient, Visible' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Patient, Hidden' })).toHaveCount(
    0,
  )
  await expect(
    page.getByLabel('Branch', { exact: true }).getByRole('option'),
  ).toHaveCount(2)
  expected404s.push(`/patients/${hidden!.id}`, `/patients/${hidden!.id}/edit`)
  expect((await page.goto(`/patients/${hidden!.id}`))?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'Patient unavailable' }),
  ).toBeVisible()
  expect((await page.goto(`/patients/${hidden!.id}/edit`))?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'Patient unavailable' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toHaveCount(0)
})

for (const role of ['billing_staff', 'dental_assistant'] as const) {
  test(`${role} can read profiles but cannot register or edit patients`, async ({
    page,
    clinic,
    createStaff,
    signIn,
  }) => {
    const [patient] = await seedPatients(clinic, [{ first_name: 'ReadOnly' }])
    await signIn(await createStaff({ roles: [role] }))
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/patients')
    await expect(
      page.getByRole('link', { name: 'Register patient' }),
    ).toHaveCount(0)
    await page.getByRole('link', { name: 'Patient, ReadOnly' }).click()
    await expect(
      page.getByRole('heading', { name: 'ReadOnly Patient', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit patient' })).toHaveCount(
      0,
    )
    await page.goto(`/patients/${patient!.id}/edit`)
    await expect(page.getByRole('alert')).toContainText(
      'You do not have permission',
    )
    await expect(
      page.getByRole('button', { name: 'Save changes', exact: true }),
    ).toHaveCount(0)
    await page.goto('/patients/new')
    await expect(
      page.getByRole('heading', { name: 'Access restricted', exact: true }),
    ).toBeVisible()
  })
}

test('adds a branch assignment without removing existing access', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  const [patient] = await seedPatients(clinic, [{ first_name: 'Shared' }])
  const staff = await createStaff({ roles: ['administrator'] })
  await signIn(staff)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(`/patients/${patient!.id}/edit`)
  await page
    .getByRole('checkbox', { name: 'Synthetic Browser Branch B', exact: true })
    .check()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Patient updated successfully.')).toBeVisible()
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Synthetic Browser Branch B' }),
  ).toBeVisible()
  const links = await clinic.admin
    .from('patient_branch_access')
    .select('branch_id')
    .eq('patient_id', patient!.id)
  expect(links.data?.map((link) => link.branch_id).sort()).toEqual(
    [clinic.branchId, clinic.otherBranchId].sort(),
  )
  const audits = await clinic.admin
    .from('audit_logs')
    .select('actor_staff_id, branch_id')
    .eq('resource_id', patient!.id)
    .eq('action', 'patient.branch_assigned')
  expect(audits.data).toEqual([
    { actor_staff_id: staff.id, branch_id: clinic.otherBranchId },
  ])
})

test('rejects a stale edit without overwriting another staff update', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  const [patient] = await seedPatients(clinic, [{ first_name: 'Original' }])
  await signIn(await createStaff({ roles: ['receptionist'] }))
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(`/patients/${patient!.id}/edit`)
  await expect(page.getByLabel('First name')).toHaveValue('Original')
  const newer = await clinic.admin
    .from('patients')
    .update({ first_name: 'Newer' })
    .eq('id', patient!.id)
  expect(newer.error).toBeNull()
  await page.getByLabel('First name').fill('Stale')
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/_serverFn/'),
  )
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  expect((await saveResponse).status()).toBe(200)
  await expect(page.getByRole('alert')).toContainText(
    'This patient has changed. Reload the profile before editing.',
  )
  const stored = await clinic.admin
    .from('patients')
    .select('first_name')
    .eq('id', patient!.id)
    .single()
  expect(stored.data?.first_name).toBe('Newer')
})

test('patient registration and profiles work at mobile width without page overflow', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(await createStaff({ roles: ['receptionist'] }))
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/patients/new')
  await fillIdentity(page, 'Mobile', 'Patient')
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Mobile Patient', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('main')
      .getByText('Synthetic Browser Branch', { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.goto('/patients')
  await expect(
    page.getByRole('link', { name: 'Patient, Mobile' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const count = await clinic.admin
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.id)
  expect(count.count).toBe(1)
})
