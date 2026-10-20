import { test, expect } from './fixtures'

const modulePages = [
  ['Dashboard', 'Dashboard'],
  ['Patients', 'Patients'],
  ['Appointments', 'Appointments'],
  ['Dental Charting', 'Dental Charting'],
  ['Treatments', 'Treatments'],
  ['Billing & Payments', 'Billing & Payments'],
  ['Inventory', 'Inventory'],
  ['Staff Management', 'Staff Management'],
  ['Reports', 'Reports'],
  ['Settings', 'Settings'],
] as const

test('all module links navigate with correct headings and breadcrumbs', async ({
  page,
  createStaff,
  signIn,
}) => {
  await signIn(await createStaff())
  await expect(page).toHaveURL(/\/dashboard$/)
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  for (const [link, heading] of modulePages) {
    await navigation.getByRole('link', { name: link, exact: true }).click()
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toContainText(heading)
    await expect(
      navigation.getByRole('link', { name: link, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  }
})

test('receptionist navigation and direct module URLs enforce role restrictions', async ({
  page,
  createStaff,
  signIn,
}) => {
  await signIn(await createStaff({ roles: ['receptionist'] }))
  await expect(page).toHaveURL(/\/dashboard$/)
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation.getByRole('link')).toHaveCount(3)
  await expect(
    navigation.getByRole('link', { name: 'Patients', exact: true }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('link', { name: 'Dental Charting', exact: true }),
  ).not.toBeVisible()
  for (const path of ['dental-charting', 'billing', 'staff', 'settings']) {
    await page.goto(`/${path}`)
    await expect(page).toHaveURL(/\/access-denied$/)
    await expect(
      page.getByRole('heading', { name: 'Access restricted', exact: true }),
    ).toBeVisible()
  }
})

test('desktop sidebar remains navigable while collapsed', async ({
  page,
  createStaff,
  signIn,
}) => {
  await signIn(await createStaff())
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toHaveAttribute('aria-expanded', 'false')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Patients', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Patients', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(
    page.getByRole('button', { name: 'Collapse sidebar' }),
  ).toHaveAttribute('aria-expanded', 'true')
})

test('mobile navigation opens, navigates, and restores focus after Escape', async ({
  page,
  createStaff,
  signIn,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(await createStaff())
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Patients', exact: true }),
  ).toBeVisible()
  await expect(drawer).not.toBeVisible()
  await menu.click()
  await page.keyboard.press('Escape')
  await expect(drawer).not.toBeVisible()
  await expect(menu).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('theme preference survives a page reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(
    page.getByRole('button', { name: 'Switch to light theme' }),
  ).toBeVisible()
})

test('private pages prohibit shared caching and frame embedding', async ({
  page,
  createStaff,
  signIn,
}) => {
  await signIn(await createStaff())
  await expect(page).toHaveURL(/\/dashboard$/)
  const response = await page.request.get('/patients')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['cache-control']).toContain('private')
  expect(response.headers()['x-frame-options']).toBe('DENY')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
})
