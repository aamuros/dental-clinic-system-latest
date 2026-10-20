import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { toJSONAsync, fromCrossJSON } from 'seroval'

// Explicit local-only integration check. Credentials and session cookies stay in
// process memory; only temporary synthetic staff and workspace records are used.
const base = new URL(process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3037')
assert(
  ['127.0.0.1', 'localhost'].includes(base.hostname),
  'HTTP verification is local-only.',
)
const config = JSON.parse(
  execFileSync('supabase', ['status', '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
)
assert(
  ['127.0.0.1', 'localhost'].includes(new URL(config.API_URL).hostname),
  'The database must also be local.',
)
assert(
  config.API_URL.endsWith(':55321'),
  'Use this project’s isolated local Supabase stack.',
)
const admin = createClient(config.API_URL, config.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const functionIds = new Map()
for (const filename of readdirSync(
  new URL('../.output/server/_ssr/', import.meta.url),
)) {
  if (!filename.endsWith('.mjs')) continue
  const source = readFileSync(
    new URL(`../.output/server/_ssr/${filename}`, import.meta.url),
    'utf8',
  )
  for (const match of source.matchAll(/id: "([a-f0-9]+)",\s*name: "(\w+)"/g))
    functionIds.set(match[2], match[1])
}
for (const name of ['getWorkspaceFn', 'getAuthStateFn', 'loginFn', 'logoutFn'])
  assert(
    functionIds.has(name),
    `Build metadata is missing ${name}. Run pnpm build first.`,
  )

const cookies = new Map()
async function request(url, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Origin', base.origin)
  if (cookies.size)
    headers.set(
      'Cookie',
      [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    )
  const response = await fetch(url, { ...options, headers, redirect: 'manual' })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const equals = pair.indexOf('=')
    const name = pair.slice(0, equals),
      value = pair.slice(equals + 1)
    if (value) cookies.set(name, value)
    else cookies.delete(name)
  }
  return response
}
async function rpc(name, method = 'GET', data) {
  const response = await request(
    `${base.origin}/_serverFn/${functionIds.get(name)}`,
    {
      method,
      headers:
        data === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body:
        data === undefined
          ? undefined
          : JSON.stringify(await toJSONAsync({ data })),
    },
  )
  if (response.status >= 300 && response.status < 400)
    return {
      redirect: new URL(response.headers.get('location'), base).pathname,
    }
  assert.equal(
    response.status,
    200,
    `${name} must return a successful response.`,
  )
  return fromCrossJSON(await response.json(), { refs: new Map() })
}
function checked(result, operation) {
  assert(!result.error, `${operation} failed.`)
  return result.data
}
async function expectRedirect(path) {
  const response = await request(new URL(path, base))
  assert.equal(
    response.status,
    307,
    `${path} should redirect without active staff access.`,
  )
  assert.equal(
    new URL(response.headers.get('location'), base).pathname,
    '/login',
  )
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
}

const clinicId = randomUUID(),
  branchId = randomUUID()
let userId
try {
  const login = await request(new URL('/login', base))
  assert.equal(login.status, 200)
  const html = await login.text()
  assert(html.includes('Staff sign in'))
  assert(!html.includes('Sign-in is not configured'))
  for (const path of [
    '/dashboard',
    '/patients',
    '/appointments',
    '/dental-charting',
    '/treatments',
    '/billing',
    '/inventory',
    '/staff',
    '/reports',
    '/settings',
  ])
    await expectRedirect(path)
  const anonymous = await rpc('getWorkspaceFn')
  assert.equal(
    anonymous.redirect,
    '/login',
    'Direct workspace calls must reject anonymous callers.',
  )
  const csrf = await fetch(
    `${base.origin}/_serverFn/${functionIds.get('logoutFn')}`,
    {
      method: 'POST',
      headers: {
        Origin: 'https://external.example.invalid',
        'x-tsr-serverFn': 'true',
      },
    },
  )
  assert.equal(csrf.status, 403, 'Cross-origin mutations must be rejected.')
  console.log(
    'PASS: login, all protected route redirects, direct endpoint denial, and CSRF protection.',
  )

  const email = `synthetic-${randomUUID()}@example.invalid`
  const password = `${randomUUID()}-Synthetic!`
  const authProbe = createClient(config.API_URL, config.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const publicSignup = await authProbe.auth.signUp({ email, password })
  if (publicSignup.data.user) userId = publicSignup.data.user.id
  assert.equal(
    publicSignup.error?.code,
    'signup_disabled',
    'Public account registration must remain disabled.',
  )
  const user = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'Synthetic Auth user creation',
  )
  userId = user.user.id
  checked(
    await admin
      .from('clinics')
      .insert({ id: clinicId, name: 'Synthetic HTTP Test Clinic' }),
    'Synthetic clinic creation',
  )
  checked(
    await admin.from('branches').insert({
      id: branchId,
      clinic_id: clinicId,
      name: 'Synthetic Test Branch',
    }),
    'Synthetic branch creation',
  )
  checked(
    await admin.from('staff_profiles').insert({
      id: userId,
      clinic_id: clinicId,
      display_name: 'Synthetic HTTP Test Staff',
    }),
    'Synthetic staff creation',
  )
  checked(
    await admin.from('staff_role_assignments').insert([
      {
        staff_id: userId,
        clinic_id: clinicId,
        branch_id: null,
        role: 'administrator',
      },
      {
        staff_id: userId,
        clinic_id: clinicId,
        branch_id: branchId,
        role: 'dentist',
      },
    ]),
    'Synthetic role creation',
  )

  const probe = await authProbe.auth.signInWithPassword({ email, password })
  assert(
    !probe.error,
    `Direct local Auth sign-in failed (${probe.error?.code ?? 'unknown'}).`,
  )
  await authProbe.auth.signOut({ scope: 'local' })
  const signedIn = await rpc('loginFn', 'POST', { email, password })
  assert.equal(
    signedIn.result?.error,
    null,
    'The server login must succeed against local Auth.',
  )
  assert(cookies.size > 0, 'Login must write session cookies.')
  const auth = await rpc('getAuthStateFn')
  assert.equal(auth.result?.status, 'authenticated')
  const workspace = await rpc('getWorkspaceFn')
  assert.equal(workspace.result?.clinic.id, clinicId)
  for (const [path, title] of [
    ['dashboard', 'Dashboard'],
    ['patients', 'Patients'],
    ['appointments', 'Appointments'],
    ['dental-charting', 'Dental Charting'],
    ['treatments', 'Treatments'],
    ['billing', 'Billing &amp; Payments'],
    ['inventory', 'Inventory'],
    ['staff', 'Staff Management'],
    ['reports', 'Reports'],
    ['settings', 'Settings'],
  ]) {
    const response = await request(new URL(`/${path}`, base))
    assert.equal(
      response.status,
      200,
      `${path} should render for an appropriately assigned staff account.`,
    )
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert(
      (await response.text()).includes(title),
      `${path} should contain its module title.`,
    )
  }
  const signedInLogin = await request(new URL('/login', base))
  assert.equal(signedInLogin.status, 307)
  assert.equal(
    new URL(signedInLogin.headers.get('location'), base).pathname,
    '/dashboard',
  )
  console.log(
    'PASS: server login, cookies, verified session, all module pages, and authenticated login redirect.',
  )

  checked(
    await admin
      .from('staff_role_assignments')
      .delete()
      .eq('staff_id', userId)
      .eq('role', 'dentist'),
    'Clinical role removal',
  )
  const restricted = await request(new URL('/dental-charting', base))
  assert.equal(restricted.status, 307)
  assert.equal(
    new URL(restricted.headers.get('location'), base).pathname,
    '/access-denied',
  )
  checked(
    await admin
      .from('staff_profiles')
      .update({ is_active: false })
      .eq('id', userId),
    'Staff deactivation',
  )
  await expectRedirect('/patients')
  const blocked = await rpc('getWorkspaceFn')
  assert.equal(
    blocked.redirect,
    '/login',
    'Deactivated staff must lose direct endpoint access.',
  )
  checked(
    await admin
      .from('staff_profiles')
      .update({ is_active: true })
      .eq('id', userId),
    'Staff reactivation',
  )
  const signedOut = await rpc('logoutFn', 'POST')
  assert.equal(signedOut.result?.success, true)
  assert.equal(cookies.size, 0, 'Logout must clear session cookies.')
  await expectRedirect('/dashboard')
  console.log(
    'PASS: role changes, staff deactivation, logout, and session-cookie clearing.',
  )
} finally {
  let cleanupFailed = false
  if (userId) {
    for (const table of ['staff_role_assignments', 'staff_profiles']) {
      const column = table === 'staff_profiles' ? 'id' : 'staff_id'
      if ((await admin.from(table).delete().eq(column, userId)).error)
        cleanupFailed = true
    }
  }
  if ((await admin.from('branches').delete().eq('id', branchId)).error)
    cleanupFailed = true
  if ((await admin.from('clinics').delete().eq('id', clinicId)).error)
    cleanupFailed = true
  if (userId && (await admin.auth.admin.deleteUser(userId)).error)
    cleanupFailed = true
  assert(
    !cleanupFailed,
    'Temporary fixture cleanup failed. Inspect synthetic HTTP test records in the isolated local project.',
  )
  console.log('Temporary synthetic fixtures removed.')
}
