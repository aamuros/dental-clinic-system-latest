import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { test as base, expect } from '@playwright/test'
import { z } from 'zod'
import type { Database } from '@/types/database'
import type { StaffRole } from '@/types/auth'

interface StaffAccount {
  id: string
  email: string
  password: string
}
interface StaffOptions {
  roles?: readonly StaffRole[]
  active?: boolean
  profile?: boolean
}
interface LocalClinic {
  admin: SupabaseClient<Database>
  id: string
  branchId: string
  name: string
}
interface Fixtures {
  createStaff: (options?: StaffOptions) => Promise<StaffAccount>
  signIn: (staff: StaffAccount) => Promise<void>
  runtimeErrors: void
}

function checked<T extends { data: unknown; error: unknown }>(
  result: T,
  label: string,
): T['data'] {
  assert(!result.error, `${label} failed.`)
  return result.data
}

export const test = base.extend<Fixtures, { clinic: LocalClinic }>({
  clinic: [
    async ({ browserName }, provide, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL
      assert(
        baseURL &&
          ['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname),
        'Staff fixtures are allowed only against a local application.',
      )
      const config = z
        .object({
          API_URL: z.url(),
          SECRET_KEY: z.string().startsWith('sb_secret_'),
        })
        .parse(
          JSON.parse(
            execFileSync('supabase', ['status', '--output', 'json'], {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
            }),
          ),
        )
      const url = new URL(config.API_URL)
      assert(
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
          url.port === '55321',
        'Use the isolated local dental Supabase stack.',
      )
      const admin = createClient<Database>(config.API_URL, config.SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const id = randomUUID(),
        branchId = randomUUID(),
        name = `Synthetic Browser Clinic ${browserName} ${id.slice(0, 8)}`
      try {
        checked(
          await admin.from('clinics').insert({ id, name }),
          'Synthetic clinic setup',
        )
        checked(
          await admin.from('branches').insert({
            id: branchId,
            clinic_id: id,
            name: 'Synthetic Browser Branch',
          }),
          'Synthetic branch setup',
        )
        await provide({ admin, id, branchId, name })
      } finally {
        checked(
          await admin.from('branches').delete().eq('clinic_id', id),
          'Synthetic branch cleanup',
        )
        checked(
          await admin.from('clinics').delete().eq('id', id),
          'Synthetic clinic cleanup',
        )
      }
    },
    { scope: 'worker' },
  ],
  createStaff: async ({ clinic }, provide) => {
    const userIds: string[] = []
    try {
      await provide(
        async ({
          roles = ['administrator', 'dentist'],
          active = true,
          profile = true,
        }: StaffOptions = {}) => {
          const email = `synthetic-browser-${randomUUID()}@example.invalid`,
            password = `${randomUUID()}-Synthetic!`
          const { user } = checked(
            await clinic.admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { role: 'administrator' },
            }),
            'Synthetic staff account setup',
          )
          assert(user, 'Synthetic user was not returned.')
          userIds.push(user.id)
          if (profile) {
            checked(
              await clinic.admin.from('staff_profiles').insert({
                id: user.id,
                clinic_id: clinic.id,
                display_name: 'Synthetic Browser Staff',
                is_active: active,
              }),
              'Synthetic staff profile setup',
            )
            if (roles.length)
              checked(
                await clinic.admin.from('staff_role_assignments').insert(
                  roles.map((role) => ({
                    staff_id: user.id,
                    clinic_id: clinic.id,
                    branch_id:
                      role === 'administrator' ? null : clinic.branchId,
                    role,
                  })),
                ),
                'Synthetic role setup',
              )
          }
          return { id: user.id, email, password }
        },
      )
    } finally {
      let failed = false
      for (const id of userIds) {
        if (
          (
            await clinic.admin
              .from('staff_role_assignments')
              .delete()
              .eq('staff_id', id)
          ).error
        )
          failed = true
        if (
          (await clinic.admin.from('staff_profiles').delete().eq('id', id))
            .error
        )
          failed = true
        if ((await clinic.admin.auth.admin.deleteUser(id)).error) failed = true
      }
      assert(!failed, 'Synthetic browser staff cleanup failed.')
    }
  },
  signIn: async ({ page }, provide) => {
    await provide(async (staff) => {
      await page.goto('/login')
      await page.getByRole('textbox', { name: 'Work email' }).fill(staff.email)
      await page.getByLabel('Password', { exact: true }).fill(staff.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    })
  },
  runtimeErrors: [
    async ({ page }, provide) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await provide()
      expect(errors, 'Browser runtime and hydration errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
