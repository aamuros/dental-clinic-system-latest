import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { LoaderCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { hasPermission } from '@/lib/auth/permissions'
import { savePatientFn } from '@/server/functions/patients'
import type { Patient } from '@/server/functions/patients'
import type { Workspace } from '@/types/auth'
import { genderLabels, genders, patientFormSchema } from './schemas'
import type { PatientFormValues, SavePatientResult } from './schemas'
import { canEditPatient, formatBirthDate } from './patient-utils'

type DuplicateWarning = Extract<SavePatientResult, { status: 'duplicates' }>

export function PatientFormPage({
  patient,
  workspace,
}: {
  patient?: Patient
  workspace: Workspace
}) {
  const router = useRouter()
  const save = useServerFn(savePatientFn)
  const [duplicates, setDuplicates] = useState<DuplicateWarning | null>(null)
  const [conflict, setConflict] = useState(false)
  const existingBranches = new Set(
    patient?.patient_branch_access.map((link) => link.branch_id),
  )
  const canManageBranches = patient
    ? patient.patient_branch_access.some((link) =>
        hasPermission(workspace.staff, 'patients.branches.manage', {
          clinicId: workspace.clinic.id,
          branchId: link.branch_id,
        }),
      )
    : hasPermission(workspace.staff, 'patients.branches.manage')
  const branches = workspace.branches.filter((branch) => {
    const scope = { clinicId: workspace.clinic.id, branchId: branch.id }
    return (
      hasPermission(workspace.staff, 'patients.write', scope) &&
      (!patient ||
        existingBranches.has(branch.id) ||
        (canManageBranches &&
          hasPermission(workspace.staff, 'patients.branches.manage', scope)))
    )
  })
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      firstName: patient?.first_name ?? '',
      middleName: patient?.middle_name ?? '',
      lastName: patient?.last_name ?? '',
      birthDate: patient?.birth_date ?? '',
      gender: (patient?.gender as PatientFormValues['gender']) ?? 'unspecified',
      phone: patient?.phone ?? '',
      email: patient?.email ?? '',
      address: patient?.address ?? '',
      branchIds: patient
        ? branches
            .filter((branch) => existingBranches.has(branch.id))
            .map((branch) => branch.id)
        : branches.length === 1
          ? [branches[0]!.id]
          : [],
    },
  })
  const selectedBranches = useWatch({ control, name: 'branchIds' })

  async function submit(values: PatientFormValues, allowDuplicate = false) {
    if (conflict) return
    clearErrors('root')
    try {
      // Existing associations are additive and cannot be removed through this form.
      const branchIds = [
        ...new Set([
          ...values.branchIds,
          ...branches
            .filter((branch) => existingBranches.has(branch.id))
            .map((branch) => branch.id),
        ]),
      ]
      const response = await save({
        data: {
          ...values,
          branchIds,
          id: patient?.id,
          expectedUpdatedAt: patient?.updated_at,
          allowDuplicate,
        },
      })
      if (response.error || !response.result) {
        if ('conflict' in response && response.conflict) {
          setConflict(true)
          setDuplicates(null)
        }
        setError('root', {
          message: response.error ?? 'Unable to save the patient.',
        })
        return
      }
      if (response.result.status === 'duplicates') {
        setDuplicates(response.result)
        return
      }
      await router.invalidate()
      await router.navigate({
        to: '/patients/$patientId',
        params: { patientId: response.result.id },
        search: { saved: patient ? 'updated' : 'created' },
      })
    } catch {
      setError('root', {
        message:
          'Unable to save the patient. Check your connection and try again.',
      })
    }
  }

  if ((patient && !canEditPatient(patient, workspace)) || !branches.length) {
    return (
      <div role="alert" className="space-y-4">
        <p>
          You do not have permission to manage this patient or an active branch.
        </p>
        <Link to="/patients" className="text-sm underline">
          Back to patients
        </Link>
      </div>
    )
  }

  const inputFields = [
    {
      name: 'firstName',
      label: 'First name',
      autoComplete: 'given-name',
      maxLength: 100,
      required: true,
    },
    {
      name: 'middleName',
      label: 'Middle name',
      autoComplete: 'additional-name',
      maxLength: 100,
    },
    {
      name: 'lastName',
      label: 'Last name',
      autoComplete: 'family-name',
      maxLength: 100,
      required: true,
    },
    {
      name: 'birthDate',
      label: 'Birth date',
      autoComplete: 'bday',
      type: 'date',
      min: '1900-01-01',
      max: new Date().toISOString().slice(0, 10),
    },
  ] as const

  return (
    <>
      <Link
        to="/patients"
        className="mb-5 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to patients
      </Link>
      <PageHeader
        title={patient ? 'Edit patient' : 'Register patient'}
        description="Keep patient identity and contact details up to date. Fields marked * are required."
      />
      <form
        noValidate
        className="max-w-3xl space-y-8"
        aria-busy={isSubmitting}
        onSubmit={handleSubmit((values) => submit(values))}
        onChange={() => setDuplicates(null)}
      >
        <fieldset disabled={isSubmitting || conflict} className="space-y-8">
          <section aria-labelledby="personal-details">
            <h2
              id="personal-details"
              className="mb-5 border-b pb-3 text-sm font-semibold"
            >
              Personal details
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {inputFields.map(({ name, label, ...props }) => (
                <div key={name} className="space-y-2">
                  <Label htmlFor={name}>
                    {label}
                    {'required' in props && props.required ? ' *' : ''}
                  </Label>
                  <Input
                    id={name}
                    {...props}
                    {...register(name)}
                    aria-invalid={!!errors[name]}
                    aria-describedby={
                      errors[name] ? `${name}-error` : undefined
                    }
                  />
                  {errors[name] && (
                    <p
                      id={`${name}-error`}
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {errors[name]?.message}
                    </p>
                  )}
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <NativeSelect
                  id="gender"
                  {...register('gender')}
                  aria-invalid={!!errors.gender}
                  aria-describedby={errors.gender ? 'gender-error' : undefined}
                >
                  {genders.map((gender) => (
                    <option key={gender} value={gender}>
                      {genderLabels[gender]}
                    </option>
                  ))}
                </NativeSelect>
                {errors.gender && (
                  <p
                    id="gender-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.gender.message}
                  </p>
                )}
              </div>
            </div>
          </section>
          <section aria-labelledby="contact-details">
            <h2
              id="contact-details"
              className="mb-5 border-b pb-3 text-sm font-semibold"
            >
              Contact information
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={32}
                  {...register('phone')}
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                />
                {errors.phone && (
                  <p
                    id="phone-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.phone.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  {...register('email')}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {errors.email && (
                  <p
                    id="email-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  autoComplete="street-address"
                  maxLength={500}
                  {...register('address')}
                  aria-invalid={!!errors.address}
                  aria-describedby={
                    errors.address ? 'address-error' : undefined
                  }
                />
                {errors.address && (
                  <p
                    id="address-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.address.message}
                  </p>
                )}
              </div>
            </div>
          </section>
          <fieldset aria-describedby="branches-help branches-error">
            <legend className="mb-3 w-full border-b pb-3 text-sm font-semibold">
              Branch access *
            </legend>
            <p
              id="branches-help"
              className="mb-4 text-sm text-muted-foreground"
            >
              {patient
                ? canManageBranches
                  ? 'Administrators can add authorized branches. Existing assignments are retained.'
                  : 'Existing assignments are retained. Only authorized administrators can add branches.'
                : canManageBranches
                  ? 'Select an initial branch. Multiple branches require administrator access to each selected branch.'
                  : 'Select one initial branch. Only authorized administrators can add more branches.'}
            </p>
            {!patient && !canManageBranches ? (
              <NativeSelect
                aria-label="Initial branch"
                value={selectedBranches[0] ?? ''}
                onChange={(event) =>
                  setValue(
                    'branchIds',
                    event.target.value ? [event.target.value] : [],
                    { shouldValidate: true },
                  )
                }
              >
                <option value="">Select a branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {branches.map((branch) => (
                  <Label
                    key={branch.id}
                    className="flex items-center gap-3 rounded-md border p-3 font-normal"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      value={branch.id}
                      {...register('branchIds')}
                      readOnly={existingBranches.has(branch.id)}
                      aria-disabled={existingBranches.has(branch.id)}
                      onClick={(event) => {
                        if (existingBranches.has(branch.id))
                          event.preventDefault()
                      }}
                    />
                    {branch.name}
                    {existingBranches.has(branch.id) && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Assigned
                      </span>
                    )}
                  </Label>
                ))}
              </div>
            )}
            {errors.branchIds && (
              <p
                id="branches-error"
                role="alert"
                className="mt-3 text-xs text-destructive"
              >
                {errors.branchIds.message}
              </p>
            )}
          </fieldset>
        </fieldset>
        {duplicates && (
          <section
            role="alert"
            aria-labelledby="duplicates-title"
            className="rounded-lg border border-amber-600/40 bg-amber-600/5 p-5"
          >
            <h2 id="duplicates-title" className="text-sm font-semibold">
              Possible duplicate{' '}
              {duplicates.matches.length === 1 ? 'patient' : 'patients'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              A name, phone number, or email matches an existing record. Review
              before saving. Profiles open in a new tab.
            </p>
            <ul className="mt-3 space-y-2">
              {duplicates.matches.map((match) => (
                <li key={match.id} className="text-sm">
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: match.id }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    {match.first_name} {match.last_name}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {formatBirthDate(match.birth_date)}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              disabled={isSubmitting || conflict}
              onClick={handleSubmit((values) => submit(values, true))}
            >
              {patient ? 'Save changes anyway' : 'Save as a separate patient'}
            </Button>
          </section>
        )}
        {errors.root && (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{errors.root.message}</p>
            {conflict && (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Reload latest patient
              </Button>
            )}
            {patient && (
              <Link
                to="/patients/$patientId"
                params={{ patientId: patient.id }}
                className="inline-block underline"
              >
                Return to profile to reload
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t pt-6">
          <Button
            type="submit"
            disabled={isSubmitting || !!duplicates || conflict}
          >
            {isSubmitting && (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {isSubmitting
              ? 'Saving…'
              : patient
                ? 'Save changes'
                : 'Register patient'}
          </Button>
          <Button variant="outline" disabled={isSubmitting} asChild>
            {patient ? (
              <Link
                to="/patients/$patientId"
                params={{ patientId: patient.id }}
              >
                Cancel
              </Link>
            ) : (
              <Link to="/patients">Cancel</Link>
            )}
          </Button>
        </div>
      </form>
    </>
  )
}
