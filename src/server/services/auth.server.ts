import '@tanstack/react-start/server-only'
import { readPublicEnv } from '@/lib/env'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { AuthState } from '@/types/auth'

export async function resolveAuth() {
  if (!readPublicEnv().success)
    return {
      state: { status: 'unconfigured' } satisfies AuthState,
      supabase: null,
    }
  const supabase = createServerSupabaseClient()
  // getUser verifies the session with Auth, including server-side revocation.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    if (
      authError.name === 'AuthSessionMissingError' ||
      [400, 401, 403].includes(authError.status ?? 0)
    ) {
      return { state: { status: 'anonymous' } satisfies AuthState, supabase }
    }
    throw new Error(
      'Authentication is temporarily unavailable. Please try again.',
    )
  }
  if (!user)
    return { state: { status: 'anonymous' } satisfies AuthState, supabase }
  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('id, clinic_id, display_name, is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError)
    throw new Error('Unable to verify staff access. Please try again.')
  if (!profile?.is_active)
    return { state: { status: 'blocked' } satisfies AuthState, supabase }
  const [roles, branches] = await Promise.all([
    supabase
      .from('staff_role_assignments')
      .select('clinic_id, branch_id, role')
      .eq('staff_id', user.id),
    supabase.from('branches').select('id').eq('clinic_id', profile.clinic_id),
  ])
  if (roles.error || branches.error)
    throw new Error('Unable to verify staff permissions. Please try again.')
  const activeBranches = new Set(branches.data.map((branch) => branch.id))
  const assignments = roles.data
    .filter(
      (role) => role.branch_id === null || activeBranches.has(role.branch_id),
    )
    .map((role) => ({
      clinicId: role.clinic_id,
      branchId: role.branch_id,
      role: role.role,
    }))
  if (!assignments.length)
    return { state: { status: 'blocked' } satisfies AuthState, supabase }
  const state: AuthState = {
    status: 'authenticated',
    staff: {
      id: profile.id,
      clinicId: profile.clinic_id,
      displayName: profile.display_name,
      isActive: profile.is_active,
      assignments,
    },
  }
  return { state, supabase }
}
