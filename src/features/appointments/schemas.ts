import { z } from 'zod'

export const appointmentStatuses = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
] as const
export const statusLabels = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
const optionalId = z.union([z.uuid(), z.literal('')]).default('')
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, 'Enter a valid date.')

export const calendarSearchSchema = z.object({
  date: date.optional(),
  view: z.enum(['day', 'week']).default('week'),
  branchId: optionalId,
  dentistId: optionalId,
  patient: z.string().trim().max(100).default(''),
  status: z.union([z.enum(appointmentStatuses), z.literal('')]).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
})
export type CalendarSearch = z.infer<typeof calendarSearchSchema>
export const appointmentOptionsSchema = z.object({
  branchId: z.uuid(),
  q: z.string().trim().max(100).default(''),
})
export const saveAppointmentSchema = z
  .object({
    id: z.uuid().optional(),
    expectedUpdatedAt: z.iso
      .datetime({ offset: true, precision: undefined })
      .optional(),
    branchId: z.uuid('Select a branch.'),
    patientId: z.uuid('Select a patient.'),
    dentistId: z.uuid('Select a dentist.'),
    localStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time.'),
    duration: z.coerce.number().int().min(5).max(480),
    status: z.enum(appointmentStatuses),
  })
  .superRefine((value, context) => {
    if (value.id && !value.expectedUpdatedAt)
      context.addIssue({
        code: 'custom',
        path: ['expectedUpdatedAt'],
        message: 'Reload this appointment before editing.',
      })
    if (!value.id && value.status !== 'scheduled')
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'New appointments must be scheduled.',
      })
  })
export type SaveAppointment = z.infer<typeof saveAppointmentSchema>
export const appointmentSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  patient_id: z.uuid(),
  dentist_staff_id: z.uuid().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(appointmentStatuses),
  updated_at: z.string(),
  patient_name: z.string(),
  dentist_name: z.string().nullable(),
  branch_name: z.string(),
})
export type Appointment = z.infer<typeof appointmentSchema>
export const scheduleResultSchema = z.object({
  appointments: z.array(appointmentSchema),
  total: z.number(),
})
export const dentistOptionsSchema = z.array(
  z.object({ id: z.uuid(), name: z.string(), branch_id: z.uuid() }),
)
export const patientOptionsSchema = z.object({
  patients: z.array(z.object({ id: z.uuid(), name: z.string() })),
  hasMore: z.boolean(),
})
