import { useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { AppointmentCalendar } from './appointment-calendar'
import { AppointmentPanel } from './appointment-panel'
import { canManageAppointments } from './access'
import { addDays, clinicDate } from './time'
import { appointmentStatuses, statusLabels } from './schemas'
import type { Appointment, CalendarSearch } from './schemas'
import type { AppointmentCalendar as CalendarData } from './server'
import type { Workspace } from '@/types/auth'

export function AppointmentCalendarPage({
  workspace,
  calendar,
  search,
}: {
  workspace: Workspace
  calendar: CalendarData
  search: CalendarSearch
}) {
  const navigate = useNavigate({ from: '/appointments' })
  const router = useRouter()
  const [panel, setPanel] = useState<Appointment | 'new' | null>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  function openPanel(value: Appointment | 'new') {
    lastFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setSuccess('')
    setPanel(value)
  }
  const [success, setSuccess] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const dentists = [
    ...new Map(
      calendar.dentists
        .filter(
          (dentist) =>
            !search.branchId || dentist.branch_id === search.branchId,
        )
        .map((dentist) => [dentist.id, dentist]),
    ).values(),
  ]
  const branches = workspace.branches.filter((branch) =>
    workspace.staff.assignments.some(
      (assignment) =>
        assignment.branchId === null ||
        (assignment.branchId === branch.id &&
          [
            'administrator',
            'dentist',
            'receptionist',
            'dental_assistant',
          ].includes(assignment.role)),
    ),
  )
  function change(next: Partial<CalendarSearch>) {
    void navigate({
      search: { ...search, date: calendar.date, page: 1, ...next },
    })
  }
  async function saved(message: string) {
    await router.invalidate({ sync: true })
    setPanel(null)
    setSuccess(message)
  }
  return (
    <>
      <PageHeader
        title="Appointments"
        description={`Daily and weekly schedules · ${calendar.timezone}`}
        action={
          canManageAppointments(workspace.staff) ? (
            <Button
              onClick={() => {
                openPanel('new')
              }}
            >
              Book appointment
            </Button>
          ) : undefined
        }
      />
      {success && (
        <p role="status" className="mb-4 rounded-md bg-muted p-3 text-sm">
          {success}
        </p>
      )}
      <form
        key={JSON.stringify(search)}
        className="mb-6 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          change({
            branchId: String(form.get('branchId') ?? ''),
            dentistId: String(form.get('dentistId') ?? ''),
            patient: String(form.get('patient') ?? ''),
            status: String(
              form.get('status') ?? '',
            ) as CalendarSearch['status'],
            date: String(form.get('date')),
          })
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="schedule-date">Date</Label>
          <Input
            id="schedule-date"
            name="date"
            type="date"
            required
            defaultValue={calendar.date}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-patient">Search patient</Label>
          <Input
            id="schedule-patient"
            name="patient"
            type="search"
            maxLength={100}
            defaultValue={search.patient}
            placeholder="Name, phone or email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-branch">Branch</Label>
          <NativeSelect
            id="schedule-branch"
            name="branchId"
            defaultValue={search.branchId}
          >
            <option value="">All authorized branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-dentist">Dentist</Label>
          <NativeSelect
            id="schedule-dentist"
            name="dentistId"
            defaultValue={search.dentistId}
          >
            <option value="">All dentists</option>
            {dentists.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-status">Status</Label>
          <NativeSelect
            id="schedule-status"
            name="status"
            defaultValue={search.status}
          >
            <option value="">All statuses</option>
            {appointmentStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              change({ branchId: '', dentistId: '', patient: '', status: '' })
            }
          >
            Clear
          </Button>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              change({
                date: addDays(calendar.date, search.view === 'week' ? -7 : -1),
              })
            }
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => change({ date: clinicDate(calendar.timezone) })}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              change({
                date: addDays(calendar.date, search.view === 'week' ? 7 : 1),
              })
            }
          >
            Next
          </Button>
          <span className="text-sm text-muted-foreground">
            {calendar.total} appointment{calendar.total === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex gap-2" role="group" aria-label="Calendar view">
          <Button
            size="sm"
            variant={search.view === 'day' ? 'default' : 'outline'}
            aria-pressed={search.view === 'day'}
            onClick={() => change({ view: 'day' })}
          >
            Day
          </Button>
          <Button
            size="sm"
            variant={search.view === 'week' ? 'default' : 'outline'}
            aria-pressed={search.view === 'week'}
            onClick={() => change({ view: 'week' })}
          >
            Week
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true)
              setRefreshError('')
              try {
                await router.invalidate()
              } catch {
                setRefreshError(
                  'Unable to refresh appointments. Please try again.',
                )
              } finally {
                setRefreshing(false)
              }
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>
      {refreshError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {refreshError}
        </p>
      )}
      {calendar.total === 0 ? (
        <EmptyState
          title="No appointments"
          description="No appointments match this date range and filters."
        />
      ) : (
        <AppointmentCalendar
          days={calendar.days}
          appointments={calendar.appointments}
          timezone={calendar.timezone}
          onSelect={(appointment) => {
            openPanel(appointment)
          }}
        />
      )}
      {calendar.total > 100 && (
        <nav
          aria-label="Appointment pages"
          className="mt-4 flex flex-wrap items-center gap-3 text-sm"
        >
          <span>
            Showing page {search.page} of {Math.ceil(calendar.total / 100)}.
            Each page shows up to 100 appointments.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={search.page <= 1}
            onClick={() => change({ page: search.page - 1 })}
          >
            Previous page
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={search.page * 100 >= calendar.total}
            onClick={() => change({ page: search.page + 1 })}
          >
            Next page
          </Button>
        </nav>
      )}
      {calendar.total > 0 && calendar.appointments.length === 0 && (
        <EmptyState
          title="No appointments on this page"
          description="Return to the first page to see appointments."
          action={
            <Button onClick={() => change({ page: 1 })}>First page</Button>
          }
        />
      )}
      {panel && (
        <AppointmentPanel
          key={panel === 'new' ? 'new' : panel.id}
          appointment={panel === 'new' ? null : panel}
          workspace={workspace}
          calendar={calendar}
          onClose={() => setPanel(null)}
          onSaved={saved}
          onRestoreFocus={() => lastFocused.current?.focus()}
        />
      )}
    </>
  )
}
