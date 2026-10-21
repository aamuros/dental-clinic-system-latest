import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import {
  directorySchema,
  patientIdSchema,
  savePatientSchema,
  saveResultSchema,
} from '@/features/patients/schemas'
import { hasPermission } from '@/lib/auth/permissions'
import { staffMiddleware } from '@/server/middleware/auth'
import { authorize } from '@/server/services/authorization.server'

export const PATIENT_PAGE_SIZE = 20

export const listPatientsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .validator(directorySchema)
  .handler(async ({ context, data }) => {
    if (!hasPermission(context.staff, 'patients.read'))
      throw new Error('Access denied.')
    if (data.branchId)
      authorize(context.staff, 'patients.read', {
        clinicId: context.staff.clinicId,
        branchId: data.branchId,
      })
    const source = data.q
      ? context.supabase.rpc(
          'search_patients',
          { p_query: data.q },
          { get: true, count: 'exact' },
        )
      : context.supabase.from('patients')
    let query = source
      .select(
        // PostgREST needs the full composite RPC result when projecting embedded
        // branch filters; a restricted projection incorrectly requests branch_id
        // from patients. These are all authorized demographic fields.
        '*, patient_branch_access!inner(branch_id, branches(id, name))',
        { count: 'exact' },
      )
      .eq('clinic_id', context.staff.clinicId)
    if (data.branchId)
      query = query.eq('patient_branch_access.branch_id', data.branchId)
    // Search resolves indexed, authorized candidates before reading rows under RLS.
    query =
      data.sort === 'name'
        ? query.order('last_name').order('first_name')
        : query.order('created_at', { ascending: data.sort === 'oldest' })
    const {
      data: rows,
      count,
      error,
    } = await query
      .order('id')
      .range(
        (data.page - 1) * PATIENT_PAGE_SIZE,
        data.page * PATIENT_PAGE_SIZE - 1,
      )
    if (error?.code === 'PGRST103') {
      // A bookmarked page can become empty after filtering or access changes.
      const bounds = await query.range(0, 0)
      if (bounds.error)
        throw new Error('Unable to load patients. Please try again.')
      return { patients: [], total: bounds.count ?? 0 }
    }
    if (error) throw new Error('Unable to load patients. Please try again.')
    return { patients: rows, total: count ?? 0 }
  })

export const getPatientFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .validator(patientIdSchema)
  .handler(async ({ context, data }) => {
    const { data: patient, error } = await context.supabase
      .from('patients')
      .select('*, patient_branch_access(branch_id, branches(id, name))')
      .eq('id', data.id)
      .eq('clinic_id', context.staff.clinicId)
      .maybeSingle()
    if (error) throw new Error('Unable to load the patient. Please try again.')
    if (!patient) throw notFound()
    const canRead = patient.patient_branch_access.some((link) =>
      hasPermission(context.staff, 'patients.read', {
        clinicId: context.staff.clinicId,
        branchId: link.branch_id,
      }),
    )
    if (!canRead) throw notFound()
    return patient
  })

export type Patient = Awaited<ReturnType<typeof getPatientFn>>
export type PatientDirectory = Awaited<ReturnType<typeof listPatientsFn>>

export const savePatientFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .validator(savePatientSchema)
  .handler(async ({ context, data }) => {
    for (const branchId of data.branchIds)
      authorize(context.staff, 'patients.write', {
        clinicId: context.staff.clinicId,
        branchId,
      })
    if (data.id) {
      const { data: patient, error } = await context.supabase
        .from('patients')
        .select('patient_branch_access(branch_id)')
        .eq('id', data.id)
        .eq('clinic_id', context.staff.clinicId)
        .maybeSingle()
      if (error)
        throw new Error('Unable to verify patient access. Please try again.')
      if (
        !patient?.patient_branch_access.some((link) =>
          hasPermission(context.staff, 'patients.write', {
            clinicId: context.staff.clinicId,
            branchId: link.branch_id,
          }),
        )
      )
        throw new Error('Patient unavailable or access denied.')
      const existingBranches = new Set(
        patient.patient_branch_access.map((link) => link.branch_id),
      )
      const additionalBranches = data.branchIds.filter(
        (branchId) => !existingBranches.has(branchId),
      )
      if (
        additionalBranches.length &&
        !patient.patient_branch_access.some((link) =>
          hasPermission(context.staff, 'patients.branches.manage', {
            clinicId: context.staff.clinicId,
            branchId: link.branch_id,
          }),
        )
      )
        throw new Error('Access denied.')
      for (const branchId of additionalBranches)
        authorize(context.staff, 'patients.branches.manage', {
          clinicId: context.staff.clinicId,
          branchId,
        })
    } else if (new Set(data.branchIds).size > 1) {
      // Receptionists may choose one initial branch; sharing requires an
      // administrator assignment covering every selected branch.
      for (const branchId of data.branchIds)
        authorize(context.staff, 'patients.branches.manage', {
          clinicId: context.staff.clinicId,
          branchId,
        })
    }
    const { id, branchIds, expectedUpdatedAt, allowDuplicate, ...details } =
      data
    const result = await context.supabase.rpc('save_patient', {
      p_details: details,
      p_branch_ids: branchIds,
      p_patient_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_allow_duplicate: allowDuplicate,
    })
    if (result.error) {
      if (result.error.code === 'PT409')
        return {
          error: 'This patient has changed. Reload the profile before editing.',
          conflict: true as const,
          result: null,
        }
      if (result.error.code === '42501')
        return {
          error:
            'Patient or branch access has changed. Reload the page and try again.',
          result: null,
        }
      return {
        error: 'Unable to save the patient. Please try again.',
        result: null,
      }
    }
    return { error: null, result: saveResultSchema.parse(result.data) }
  })
