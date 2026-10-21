import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dayBoundary, addDays, formatTime } from './time'
import { statusLabels } from './schemas'
import type { Appointment } from './schemas'

export function AppointmentCalendar({
  days,
  appointments,
  timezone,
  onSelect,
}: {
  days: string[]
  appointments: Appointment[]
  timezone: string
  onSelect: (appointment: Appointment) => void
}) {
  return (
    <div
      className={`grid min-w-0 divide-y rounded-lg border bg-background ${days.length > 1 ? 'lg:grid-cols-7 lg:divide-x lg:divide-y-0' : ''}`}
      aria-label="Appointment calendar"
    >
      {days.map((day) => {
        const start = Date.parse(dayBoundary(day, timezone))
        const end = Date.parse(dayBoundary(addDays(day, 1), timezone))
        const visits = appointments.filter(
          (appointment) =>
            Date.parse(appointment.starts_at) < end &&
            Date.parse(appointment.ends_at) > start,
        )
        return (
          <section key={day} className="min-w-0" aria-label={day}>
            <h2 className="border-b bg-muted/30 px-3 py-3 text-sm font-medium">
              <time dateTime={day}>
                {new Intl.DateTimeFormat('en', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(`${day}T12:00:00Z`))}
              </time>
              <span className="ml-2 text-xs text-muted-foreground">
                {visits.length}
              </span>
            </h2>
            <ul className="min-h-28 space-y-2 p-2 lg:min-h-80">
              {visits.length === 0 && (
                <li className="px-1 py-4 text-xs text-muted-foreground">
                  No appointments
                </li>
              )}
              {visits.map((appointment) => (
                <li key={appointment.id}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start border-l-2 border-primary bg-muted/40 p-3 text-left whitespace-normal hover:bg-muted"
                    onClick={() => onSelect(appointment)}
                    aria-label={`View ${appointment.patient_name}, ${formatTime(appointment.starts_at, timezone)}, ${statusLabels[appointment.status]}`}
                  >
                    <span className="flex min-w-0 flex-col items-start gap-1.5">
                      <span className="text-xs font-medium">
                        {formatTime(appointment.starts_at, timezone)} –{' '}
                        {formatTime(appointment.ends_at, timezone)}
                      </span>
                      <span className="break-words font-semibold">
                        {appointment.patient_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {appointment.dentist_name ?? 'Unassigned dentist'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {appointment.branch_name}
                      </span>
                      <Badge
                        variant={
                          appointment.status === 'cancelled'
                            ? 'outline'
                            : 'secondary'
                        }
                      >
                        {statusLabels[appointment.status]}
                      </Badge>
                      {Date.parse(appointment.starts_at) < start && (
                        <span className="text-xs text-muted-foreground">
                          Continues from previous day
                        </span>
                      )}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
