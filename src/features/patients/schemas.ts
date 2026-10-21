import { z } from 'zod'
import { clinicDate } from '@/features/appointments/time'

export const genders = [
  'unspecified',
  'female',
  'male',
  'non_binary',
  'prefer_not_to_say',
] as const
export const genderLabels: Record<(typeof genders)[number], string> = {
  unspecified: 'Not recorded',
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
}

function isCalendarBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01'
  )
}

export function isValidBirthDate(
  value: string,
  timezone: string,
  now = new Date(),
) {
  return isCalendarBirthDate(value) && value <= clinicDate(timezone, now)
}

export const patientDetailsSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name.').max(100),
  middleName: z.string().trim().max(100),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(100),
  birthDate: z
    .string()
    .refine(
      (value) => value === '' || isCalendarBirthDate(value),
      'Enter a valid birth date from 1900 through today in the clinic time zone.',
    ),
  gender: z.enum(genders),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine(
      (value) =>
        value === '' ||
        (/^[+()\d .-]+$/.test(value) &&
          value.replace(/\D/g, '').length >= 7 &&
          value.replace(/\D/g, '').length <= 20),
      'Enter a phone number with 7–20 digits.',
    ),
  email: z
    .string()
    .trim()
    .pipe(
      z.union([
        z.literal(''),
        z.email('Enter a valid email address.').max(254),
      ]),
    )
    .transform((value) => value.toLowerCase()),
  address: z.string().trim().max(500),
})

// The transport schema validates calendar dates. The current-date limit needs
// trusted clinic context and is applied in the form and again on the server.
const patientFormSchema = patientDetailsSchema.extend({
  branchIds: z.array(z.uuid()).min(1, 'Select at least one branch.').max(100),
})
export type PatientFormValues = z.infer<typeof patientFormSchema>

export function createPatientFormSchema(timezone: string) {
  return patientFormSchema.refine(
    (value) =>
      value.birthDate === '' || isValidBirthDate(value.birthDate, timezone),
    {
      path: ['birthDate'],
      message:
        'Enter a valid birth date from 1900 through today in the clinic time zone.',
    },
  )
}

export const savePatientSchema = patientFormSchema
  .extend({
    id: z.uuid().optional(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
    allowDuplicate: z.boolean().default(false),
  })
  .refine(
    (value) => !value.id || !!value.expectedUpdatedAt,
    'Reload the patient before saving.',
  )

export const patientIdSchema = z.object({ id: z.uuid() })
export const directorySchema = z.object({
  q: z.string().trim().max(100).catch('').default(''),
  branchId: z
    .union([z.uuid(), z.literal('')])
    .catch('')
    .default(''),
  sort: z.enum(['name', 'newest', 'oldest']).catch('name').default('name'),
  page: z.coerce.number().int().min(1).max(100000).catch(1).default(1),
})
export type DirectorySearch = z.infer<typeof directorySchema>

export const saveResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), id: z.uuid() }),
  z.object({
    status: z.literal('duplicates'),
    matches: z.array(
      z.object({
        id: z.uuid(),
        first_name: z.string(),
        last_name: z.string(),
        birth_date: z.string().nullable(),
      }),
    ),
  }),
])
export type SavePatientResult = z.infer<typeof saveResultSchema>
