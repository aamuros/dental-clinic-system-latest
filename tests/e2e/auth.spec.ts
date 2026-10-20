import { test, expect } from './fixtures'

test('anonymous visitors are redirected away from a protected module', async ({
  page,
}) => {
  await page.goto('/patients')
  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Staff sign in' }),
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Work email' })).toBeVisible()
})

test('the sign-in page supports a theme change', async ({ page }) => {
  await page.goto('/login')
  const toggle = page.getByRole('button', { name: /Switch to .* theme/ })
  const originalLabel = await toggle.getAttribute('aria-label')
  await toggle.click()
  await expect(toggle).not.toHaveAttribute('aria-label', originalLabel ?? '')
})

test('all private module URLs reject an anonymous browser', async ({
  page,
}) => {
  for (const path of [
    'dashboard',
    'patients',
    'appointments',
    'dental-charting',
    'treatments',
    'billing',
    'inventory',
    'staff',
    'reports',
    'settings',
  ]) {
    await page.goto(`/${path}`)
    await expect(page).toHaveURL(/\/login$/)
    await expect(
      page.getByRole('heading', { name: 'Staff sign in' }),
    ).toBeVisible()
  }
})

test('invalid form input is accessible and does not submit credentials', async ({
  page,
}) => {
  const submissions: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_serverFn/'))
      submissions.push(request.url())
  })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByText('Enter a valid work email address.'),
  ).toBeVisible()
  await expect(page.getByText('Enter your password.')).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Work email' }),
  ).toHaveAttribute('aria-invalid', 'true')
  expect(submissions).toEqual([])
})

test('unknown credentials receive a generic error and remain signed out', async ({
  page,
}) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: 'Work email' })
    .fill('synthetic-unknown@example.invalid')
  await page
    .getByLabel('Password', { exact: true })
    .fill('Synthetic-incorrect-password!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Unable to sign in. Check your credentials or contact your administrator.',
  )
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled()
  await expect(page).toHaveURL(/\/login$/)
})

test('verified staff sessions survive reload and redirect away from login', async ({
  page,
  context,
  createStaff,
  signIn,
}) => {
  await signIn(await createStaff())
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  const cookies = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith('sb-'),
  )
  expect(cookies.length).toBeGreaterThan(0)
  expect(
    cookies.every((cookie) => cookie.sameSite === 'Lax' && cookie.path === '/'),
  ).toBe(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  await page.goto('/login')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('logout confirmation can cancel, then clears access including browser history', async ({
  page,
  context,
  createStaff,
  signIn,
}) => {
  await signIn(await createStaff())
  await expect(page).toHaveURL(/\/dashboard$/)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Patients', exact: true })
    .click()
  await expect(page).toHaveURL(/\/patients$/)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page).toHaveURL(/\/patients$/)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Sign out', exact: true })
    .click()
  await expect(page).toHaveURL(/\/login$/)
  expect(
    (await context.cookies()).filter((cookie) => cookie.name.startsWith('sb-')),
  ).toEqual([])
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).not.toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Patients', exact: true }),
  ).not.toBeVisible()
})

for (const [name, options] of [
  ['inactive staff', { active: false }],
  [
    'accounts without a profile despite administrator metadata',
    { profile: false },
  ],
  ['accounts without role assignments', { roles: [] }],
] as const) {
  test(`blocks ${name}`, async ({ page, createStaff, signIn }) => {
    await signIn(await createStaff({ ...options }))
    await expect(page.getByRole('alert')).toContainText(
      'does not have active staff access',
    )
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).not.toBeVisible()
    await page.goto('/patients')
    await expect(page).toHaveURL(/\/login$/)
  })
}

test('staff deactivation takes effect on the next server request', async ({
  page,
  clinic,
  createStaff,
  signIn,
}) => {
  const staff = await createStaff()
  await signIn(staff)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  const result = await clinic.admin
    .from('staff_profiles')
    .update({ is_active: false })
    .eq('id', staff.id)
  expect(result.error).toBeNull()
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('alert')).toContainText(
    'does not have active staff access',
  )
})
