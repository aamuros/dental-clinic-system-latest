import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { canManageAppointments } from './access'
import { getAppointmentPatientsFn, saveAppointmentFn } from './server'
import { localDateTime, formatTime } from './time'
import {
  appointmentStatuses,
  saveAppointmentSchema,
  statusLabels,
} from './schemas'
import type { Appointment, SaveAppointment } from './schemas'
import type { AppointmentCalendar } from './server'
import type { Workspace } from '@/types/auth'

export function AppointmentPanel({
  appointment,
  workspace,
  calendar,
  onClose,
  onSaved,
  onRestoreFocus,
}: {
  appointment: Appointment | null
  workspace: Workspace
  calendar: AppointmentCalendar
  onClose: () => void
  onSaved: (message: string) => Promise<void>
  onRestoreFocus: () => void
}) {
  const allowedBranches = workspace.branches.filter((branch) =>
    canManageAppointments(workspace.staff, branch.id),
  )
  const manageable = appointment
    ? canManageAppointments(workspace.staff, appointment.branch_id)
    : allowedBranches.length > 0
  const terminal =
    appointment?.status === 'completed' || appointment?.status === 'cancelled'
  const [editing, setEditing] = useState(!appointment)
  const [openedAt] = useState(Date.now)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [values, setValues] = useState<SaveAppointment>({
    id: appointment?.id,
    expectedUpdatedAt: appointment?.updated_at,
    branchId: appointment?.branch_id ?? allowedBranches[0]?.id ?? '',
    patientId: appointment?.patient_id ?? '',
    dentistId: appointment?.dentist_staff_id ?? '',
    localStart: appointment
      ? localDateTime(appointment.starts_at, calendar.timezone)
      : `${calendar.date}T09:00`,
    duration: appointment
      ? (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) /
        60_000
      : 30,
    status: appointment?.status ?? 'scheduled',
  })
  const patients = useQuery({
    queryKey: ['appointment-patients', values.branchId, search],
    queryFn: () =>
      getAppointmentPatientsFn({
        data: { branchId: values.branchId, q: search },
      }),
    enabled: editing && manageable && !!values.branchId,
    staleTime: 0,
  })
  const dentists = calendar.dentists.filter(
    (dentist) => dentist.branch_id === values.branchId,
  )
  const patientOptions = [...(patients.data?.patients ?? [])]
  if (
    appointment &&
    appointment.branch_id === values.branchId &&
    !patientOptions.some((patient) => patient.id === appointment.patient_id)
  ) {
    patientOptions.unshift({
      id: appointment.patient_id,
      name: appointment.patient_name,
    })
  }

  async function save(status = values.status) {
    setError('')
    const parsed = saveAppointmentSchema.safeParse({ ...values, status })
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? 'Check the appointment details.',
      )
      return false
    }
    setPending(true)
    try {
      const result = await saveAppointmentFn({ data: parsed.data })
      if (result.error) {
        setError(result.error)
        return false
      }
      await onSaved(
        status === 'cancelled'
          ? 'Appointment cancelled.'
          : appointment
            ? 'Appointment updated.'
            : 'Appointment booked.',
      )
      return true
    } catch {
      setError(
        'Unable to save the appointment. Check your connection and try again.',
      )
      return false
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-lg"
        showCloseButton={!pending}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {appointment ? 'Appointment details' : 'Book appointment'}
          </SheetTitle>
          <SheetDescription>
            All times are in {calendar.timezone}.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-6 pb-6">
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {appointment && !editing ? (
            <>
              <dl className="space-y-4 text-sm">
                {[
                  ['Patient', appointment.patient_name],
                  ['Dentist', appointment.dentist_name ?? 'Unassigned dentist'],
                  ['Branch', appointment.branch_name],
                  [
                    'Date',
                    localDateTime(
                      appointment.starts_at,
                      calendar.timezone,
                    ).slice(0, 10),
                  ],
                  [
                    'Time',
                    `${formatTime(appointment.starts_at, calendar.timezone)} – ${formatTime(appointment.ends_at, calendar.timezone)}`,
                  ],
                  ['Status', statusLabels[appointment.status]],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {manageable && !terminal && (
                <Button onClick={() => setEditing(true)}>
                  Reschedule or change status
                </Button>
              )}
              {terminal && (
                <p className="text-sm text-muted-foreground">
                  {statusLabels[appointment.status]} appointments are read-only.
                </p>
              )}
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <fieldset disabled={pending} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="booking-branch">Booking branch</Label>
                  <NativeSelect
                    id="booking-branch"
                    value={values.branchId}
                    required
                    onChange={(event) => {
                      setValues({
                        ...values,
                        branchId: event.target.value,
                        patientId: '',
                        dentistId: '',
                      })
                      setQuery('')
                      setSearch('')
                    }}
                  >
                    <option value="">Select branch</option>
                    {allowedBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-patient-search">
                    Find existing patient
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="search"
                      id="booking-patient-search"
                      value={query}
                      maxLength={100}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const nextSearch = query.trim()
                        if (nextSearch !== search) {
                          setValues((current) => ({
                            ...current,
                            patientId: '',
                          }))
                        }
                        setSearch(nextSearch)
                      }}
                    >
                      Search
                    </Button>
                  </div>
                  {patients.isFetching && (
                    <p role="status" className="text-xs text-muted-foreground">
                      Loading patients…
                    </p>
                  )}
                  {patients.isError && (
                    <p role="alert" className="text-sm text-destructive">
                      Unable to load patients.{' '}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void patients.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  {patients.data?.hasMore && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first 20 patients. Search to narrow the
                      results.
                    </p>
                  )}
                  {patients.data?.patients.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No matching patients authorized at this branch.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-patient">Patient</Label>
                  <NativeSelect
                    id="booking-patient"
                    required
                    value={values.patientId}
                    onChange={(event) =>
                      setValues({ ...values, patientId: event.target.value })
                    }
                  >
                    <option value="">Select patient</option>
                    {patientOptions.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} · {patient.id.slice(0, 8)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-dentist">Booking dentist</Label>
                  <NativeSelect
                    id="booking-dentist"
                    required
                    value={values.dentistId}
                    onChange={(event) =>
                      setValues({ ...values, dentistId: event.target.value })
                    }
                  >
                    <option value="">Select dentist</option>
                    {dentists.map((dentist) => (
                      <option key={dentist.id} value={dentist.id}>
                        {dentist.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {dentists.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No active dentists are assigned to this branch.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-time">Date and time</Label>
                  <Input
                    id="booking-time"
                    type="datetime-local"
                    required
                    value={values.localStart}
                    onChange={(event) =>
                      setValues({ ...values, localStart: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-duration">Duration (minutes)</Label>
                  <Input
                    id="booking-duration"
                    type="number"
                    required
                    min={5}
                    max={480}
                    value={values.duration}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        duration: Number(event.target.value),
                      })
                    }
                  />
                </div>
                {appointment && (
                  <div className="space-y-2">
                    <Label htmlFor="booking-status">Appointment status</Label>
                    <NativeSelect
                      id="booking-status"
                      value={values.status}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          status: event.target
                            .value as SaveAppointment['status'],
                        })
                      }
                    >
                      {appointmentStatuses
                        .filter(
                          (status) =>
                            status !== 'cancelled' &&
                            (status !== 'completed' ||
                              Date.parse(appointment.starts_at) <= openedAt),
                        )
                        .map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                    </NativeSelect>
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={
                    patients.isFetching ||
                    !values.patientId ||
                    !values.dentistId
                  }
                >
                  {pending
                    ? 'Saving…'
                    : appointment
                      ? 'Save appointment'
                      : 'Book appointment'}
                </Button>
              </fieldset>
            </form>
          )}
          {appointment && manageable && !terminal && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" disabled={pending}>
                  Cancel appointment
                </Button>
              }
              title="Cancel this appointment?"
              description="The appointment remains in the calendar as Cancelled and its time becomes available."
              confirmLabel="Yes, cancel appointment"
              onConfirm={async () => {
                // Cancellation always uses the original schedule, not unsaved edits.
                const original = {
                  ...values,
                  branchId: appointment.branch_id,
                  patientId: appointment.patient_id,
                  dentistId: appointment.dentist_staff_id ?? '',
                  localStart: localDateTime(
                    appointment.starts_at,
                    calendar.timezone,
                  ),
                  duration:
                    (Date.parse(appointment.ends_at) -
                      Date.parse(appointment.starts_at)) /
                    60_000,
                  status: 'cancelled' as const,
                }
                setPending(true)
                try {
                  const result = await saveAppointmentFn({ data: original })
                  if (result.error) {
                    setError(result.error)
                    throw new Error(result.error)
                  }
                  await onSaved('Appointment cancelled.')
                } finally {
                  setPending(false)
                }
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
