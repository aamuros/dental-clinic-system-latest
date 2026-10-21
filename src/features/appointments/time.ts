const partsFormatter = (timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

export function localDateTime(instant: string | Date, timezone: string) {
  const parts = Object.fromEntries(
    partsFormatter(timezone)
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function clinicDate(timezone: string, now = new Date()) {
  return localDateTime(now, timezone).slice(0, 10)
}

// Intl supplies the IANA rules. Enumerate nearby offsets, then round-trip each
// candidate; zero matches is a DST gap and two matches is an ambiguous wall time.
export function localToInstant(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Enter a valid date and time.')
  const wall = Date.parse(`${value}:00Z`)
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== value
  )
    throw new Error('Enter a valid date and time.')
  const offsets = new Set<number>()
  for (let hour = -36; hour <= 36; hour += 6) {
    const probe = wall + hour * 3_600_000
    const local = localDateTime(new Date(probe), timezone)
    offsets.add(Date.parse(`${local}:00Z`) - probe)
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter(
      (candidate) => localDateTime(new Date(candidate), timezone) === value,
    )
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'This time occurs twice because of daylight saving. Choose another time.'
        : 'This local time does not exist because of daylight saving. Choose another time.',
    )
  return new Date(matches[0]!).toISOString()
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function calendarDays(date: string, view: 'day' | 'week') {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const start = view === 'week' ? addDays(date, -((weekday + 6) % 7)) : date
  return Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) =>
    addDays(start, index),
  )
}

// Day boundaries can themselves be DST gaps (e.g. America/Santiago).
// Locate the first actual instant belonging to a date rather than assuming 24h.
export function dayBoundary(date: string, timezone: string) {
  let low = Date.parse(`${date}T00:00:00Z`) - 36 * 3_600_000
  let high = low + 72 * 3_600_000
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (clinicDate(timezone, new Date(middle)) < date) low = middle
    else high = middle
  }
  return new Date(high).toISOString()
}

export function formatTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(instant))
}
