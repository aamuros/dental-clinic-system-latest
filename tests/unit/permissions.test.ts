import { describe, expect, it } from 'vitest'
import { assertPermission, hasPermission } from '@/lib/auth/permissions'
import type { StaffAccess, StaffRole } from '@/types/auth'

function staff(
  role: StaffRole = 'dentist',
  branchId: string | null = 'branch-a',
): StaffAccess {
  return {
    id: 'staff-a',
    clinicId: 'clinic-a',
    displayName: 'Synthetic Staff',
    isActive: true,
    assignments: [{ clinicId: 'clinic-a', branchId, role }],
  }
}
const branch = { clinicId: 'clinic-a', branchId: 'branch-a' }

describe('server authorization foundation', () => {
  it('denies missing, inactive, and unassigned staff', () => {
    expect(() => assertPermission(null, 'patients.read', branch)).toThrow(
      'Access denied',
    )
    expect(() =>
      assertPermission(
        { ...staff(), isActive: false },
        'patients.read',
        branch,
      ),
    ).toThrow('Access denied')
    expect(() =>
      assertPermission(
        { ...staff(), assignments: [] },
        'patients.read',
        branch,
      ),
    ).toThrow('Access denied')
  })
  it('allows an explicitly assigned dentist to access clinical data in their branch', () => {
    expect(() =>
      assertPermission(staff(), 'clinical.read', branch),
    ).not.toThrow()
  })
  it('rejects another branch or clinic', () => {
    expect(() =>
      assertPermission(staff(), 'patients.read', {
        ...branch,
        branchId: 'branch-b',
      }),
    ).toThrow('Access denied')
    expect(() =>
      assertPermission(staff(), 'patients.read', {
        ...branch,
        clinicId: 'clinic-b',
      }),
    ).toThrow('Access denied')
  })
  it('does not turn a branch role into clinic-wide access', () => {
    expect(
      hasPermission(staff(), 'patients.read', {
        clinicId: 'clinic-a',
        branchId: null,
      }),
    ).toBe(false)
  })
  it.each(['administrator', 'receptionist', 'billing_staff'] as const)(
    'denies clinical access to %s without a clinical assignment',
    (role) => {
      expect(() =>
        assertPermission(staff(role), 'clinical.read', branch),
      ).toThrow('Access denied')
    },
  )
  it('gives assistants clinical read access without clinical write access', () => {
    expect(
      hasPermission(staff('dental_assistant'), 'clinical.read', branch),
    ).toBe(true)
    expect(
      hasPermission(staff('dental_assistant'), 'clinical.write', branch),
    ).toBe(false)
  })
  it('restricts appointment data from billing staff', () => {
    expect(hasPermission(staff('billing_staff'), 'patients.read', branch)).toBe(
      true,
    )
    expect(
      hasPermission(staff('billing_staff'), 'appointments.read', branch),
    ).toBe(false)
  })
  it('permits clinic-wide administrative reads without cross-clinic access', () => {
    const admin = staff('administrator', null)
    expect(
      hasPermission(admin, 'patients.read', {
        ...branch,
        branchId: 'branch-b',
      }),
    ).toBe(true)
    expect(
      hasPermission(admin, 'patients.read', {
        clinicId: 'clinic-b',
        branchId: 'branch-b',
      }),
    ).toBe(false)
  })
  it('ignores malformed assignments for another clinic', () => {
    const context = staff()
    context.assignments = [
      { clinicId: 'clinic-b', branchId: null, role: 'administrator' },
    ]
    expect(hasPermission(context, 'patients.read', branch)).toBe(false)
  })
  it('combines multiple explicitly assigned roles within their own scopes', () => {
    const context = staff('administrator', null)
    context.assignments.push({
      clinicId: 'clinic-a',
      branchId: 'branch-a',
      role: 'dentist',
    })
    expect(hasPermission(context, 'clinical.read', branch)).toBe(true)
    expect(
      hasPermission(context, 'clinical.read', {
        ...branch,
        branchId: 'branch-b',
      }),
    ).toBe(false)
  })
})
