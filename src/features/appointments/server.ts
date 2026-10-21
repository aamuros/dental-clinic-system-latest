import { createServerFn } from '@tanstack/react-start'
import { hasPermission } from '@/lib/auth/permissions'
import { staffMiddleware } from '@/server/middleware/auth'
import { canManageAppointments } from './access'
import {
  addDays,
  calendarDays,
  clinicDate,
  dayBoundary,
  localToInstant,
  localDateTime,
} from './time'
import {
  appointmentOptionsSchema,
  calendarSearchSchema,
  dentistOptionsSchema,
  patientOptionsSchema,
  saveAppointmentSchema,
  scheduleResultSchema,
} from './schemas'

export const getAppointmentCalendarFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .validator(calendarSearchSchema)
  .handler(async ({ context, data }) => {
    if (
      !hasPermission(
        context.staff,
        'appointments.read',
        data.branchId
          ? { clinicId: context.staff.clinicId, branchId: data.branchId }
          : undefined,
      )
    )
      throw new Error('Access denied.')
    const clinic = await context.supabase
      .from('clinics')
      .select('timezone')
      .eq('id', context.staff.clinicId)
      .single()
    if (clinic.error) throw new Error('Unable to load the clinic time zone.')
    const timezone = clinic.data.timezone
    const date = data.date ?? clinicDate(timezone)
    const days = calendarDays(date, data.view)
    const [schedule, dentists] = await Promise.all([
      context.supabase.rpc('appointment_schedule', {
        p_from: dayBoundary(days[0]!, timezone),
        p_to: dayBoundary(addDays(days.at(-1)!, 1), timezone),
        p_branch: data.branchId || undefined,
        p_dentist: data.dentistId || undefined,
        p_patient: data.patient,
        p_status: data.status || undefined,
        p_page: data.page,
      }),
      context.supabase.rpc('appointment_dentists'),
    ])
    if (schedule.error || dentists.error)
      throw new Error('Unable to load appointments. Please try again.')
    return {
      ...scheduleResultSchema.parse(schedule.data),
      dentists: dentistOptionsSchema.parse(dentists.data),
      timezone,
      date,
      days,
    }
  })

export const getAppointmentPatientsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .validator(appointmentOptionsSchema)
  .handler(async ({ context, data }) => {
    if (!canManageAppointments(context.staff, data.branchId))
      throw new Error('Access denied.')
    const result = await context.supabase.rpc('appointment_patients', {
      p_branch: data.branchId,
      p_query: data.q,
    })
    if (result.error)
      throw new Error('Unable to search patients. Please try again.')
    return patientOptionsSchema.parse(result.data)
  })

export const saveAppointmentFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .validator(saveAppointmentSchema)
  .handler(async ({ context, data }) => {
    if (!canManageAppointments(context.staff, data.branchId))
      throw new Error('Access denied.')
    const clinic = await context.supabase
      .from('clinics')
      .select('timezone')
      .eq('id', context.staff.clinicId)
      .single()
    if (clinic.error) throw new Error('Unable to load the clinic time zone.')
    let existingStart: string | undefined
    if (data.id) {
      const existing = await context.supabase
        .from('appointments')
        .select('branch_id, starts_at')
        .eq('id', data.id)
        .eq('clinic_id', context.staff.clinicId)
        .maybeSingle()
      if (existing.error)
        return { error: 'Unable to save the appointment. Please try again.' }
      if (
        !existing.data ||
        !canManageAppointments(context.staff, existing.data.branch_id)
      ) {
        return {
          error:
            'Appointment, patient, dentist, or branch access has changed. Reload the calendar.',
        }
      }
      existingStart = existing.data.starts_at
    }
    let startsAt: string
    try {
      // Minute-precision inputs must preserve the database's exact instant when
      // only the status changes, including seconds and repeated DST wall times.
      // The database still checks the exact version token after this RLS read.
      startsAt =
        existingStart &&
        localDateTime(existingStart, clinic.data.timezone) === data.localStart
          ? existingStart
          : localToInstant(data.localStart, clinic.data.timezone)
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Invalid appointment time.',
      }
    }
    const result = await context.supabase.rpc('save_appointment', {
      p_branch: data.branchId,
      p_patient: data.patientId,
      p_dentist: data.dentistId,
      p_start: startsAt,
      p_duration: data.duration,
      p_status: data.status,
      p_id: data.id,
      p_expected_updated_at: data.expectedUpdatedAt,
    })
    if (result.error) {
      const messages: Record<string, string> = {
        '23P01':
          'This dentist already has an appointment at that time. Choose another time.',
        PT409:
          'This appointment has changed. Close it and reload the calendar before editing.',
        '42501':
          'Appointment, patient, dentist, or branch access has changed. Reload the calendar.',
        '22023':
          'Check the time, duration, and status. Completed and cancelled appointments cannot be changed.',
      }
      return {
        error:
          messages[result.error.code] ??
          'Unable to save the appointment. Please try again.',
      }
    }
    return { error: null }
  })

export type AppointmentCalendar = Awaited<
  ReturnType<typeof getAppointmentCalendarFn>
>
