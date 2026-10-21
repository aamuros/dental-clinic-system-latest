# Appointment scheduling

Implementation branch: `feat/appointment-scheduling`; worktree: `/private/tmp/dental-appointments`.

The `/appointments` route provides day and Monday-based week views, date navigation, patient name/contact search, branch/dentist/status filters, and explicit pagination at 100 appointments. Appointments spanning midnight appear on each affected day. The booking/details panel uses existing shadcn controls, focus management, labelled fields, and announced loading/error/success states. Smaller screens show the week's days vertically.

All feature code, schemas, time conversion, access checks, and TanStack server functions live in `src/features/appointments`. Existing authentication middleware supplies the verified staff member and cookie-authenticated Supabase client. No privileged keys are used by application code.

## Access and workflow

- Administrators, receptionists, and dentists can book/manage appointments at branches where they have one of those roles. Dental assistants can read their branch calendars. Billing staff cannot access appointments.
- Every new booking starts as Scheduled, requires an active dentist assigned to the selected branch, and requires the existing patient-to-branch link. Booking cannot grant patient access to a new branch.
- Appointment details can be edited or rescheduled, including a move to another authorized branch. Both original and destination branch permissions are checked in the database.
- Scheduled appointments can be Confirmed, Completed once their start time has passed, or Cancelled. Confirmed appointments can be Completed or Cancelled. A reschedule can reset a Confirmed appointment to Scheduled. Completed and Cancelled appointments are immutable.
- New bookings and reschedules must start in the future. Duration is 5–480 whole minutes. Confirmation/cancellation of an unchanged existing schedule can happen after its start.
- Cancellation preserves the record and releases the time slot. Completed visits continue to occupy their historical slot. Adjacent visits are allowed.
- UTC instants are stored in PostgreSQL `timestamptz`. Date filters, day/week boundaries, input conversion, and display use the clinic's configured IANA time zone, independently of the operator's device. Ambiguous and nonexistent local booking times during daylight-saving transitions are rejected with a useful message. Calendar boundaries support 23/25-hour days and midnight transitions.

## Database and audit guarantees

The additive migration `20261021021858_appointment_scheduling.sql` retains appointment SELECT RLS and all existing shared policies. Direct authenticated table mutations remain revoked. Narrow SECURITY INVOKER public RPCs delegate to private SECURITY DEFINER functions with pinned empty search paths and explicit live role/branch checks. Dentist lookup exposes only scheduling identities at authorized branches; it does not broaden staff profile RLS.

A partial GiST exclusion constraint on `(dentist_staff_id, tstzrange(starts_at, ends_at, '[)'))` rejects overlapping non-cancelled visits across every branch, including concurrent requests. PostgreSQL exclusion violation `23P01` maps to a scheduling conflict message. Transaction-scoped advisory locks serialize writes for each affected dentist before taking appointment row locks. Old and new dentist lock keys are sorted consistently to avoid deadlocks during concurrent swaps; the GiST constraint remains the final invariant, including for writes that bypass the RPC. Appointment row locks and exact `updated_at` tokens prevent stale edits (`PT409`). Referenced patient and dentist assignment rows are locked while booking.

Successful writes append existing `audit_logs` events in the same transaction: `appointment.created`, `appointment.updated`, `appointment.rescheduled`, `appointment.moved` (original branch when moving), `appointment.status_changed`, and `appointment.cancelled`. Actor and clinic derive from database identity. Events contain resource identifiers/actions, without patient or clinical payloads. Failed writes roll back their events. Existing administrator-only audit access applies.

## Integration and deployment

1. Merge alongside Patient Management; do not replace or squash its independent changes. No Patient Management file, shared permission file, auth service, account, or patient data was modified by this branch.
2. The shared changes are the existing appointment route, generated `src/types/database.ts`, and appointment fixtures in `supabase/tests/foundation.test.sql`. Resolve generated type conflicts by applying both modules' migrations to a local database and running `pnpm db:types`; never manually merge generated types. Regenerate routes with `pnpm generate-routes` if route generation conflicts.
3. Apply the additive migration using the normal migration workflow (`pnpm db:migrate` locally). Production needs permission to install `btree_gist`. Constraint creation takes a table lock; coordinate migration timing with active schedulers.
4. Before deployment, inspect legacy appointments for null dentists, invalid durations, or existing dentist overlaps. The new check constraints are NOT VALID to preserve existing rows, but apply to every subsequent write. The exclusion constraint validates existing rows and will deliberately fail rather than silently delete or alter conflicting appointments. Resolve any real conflicts through an approved data migration. Existing unassigned visits can be viewed; assign a valid dentist and schedule before managing them through the new workflow.
5. Verify each clinic's `timezone` is a valid IANA identifier, and each bookable dentist has an active `dentist` role at the intended branch. Administrator status alone does not qualify someone as a dentist. No production migration, reset, seeding, or account modification was performed.

Useful read-only overlap preflight:

```sql
select a.id, b.id as conflicting_id, a.dentist_staff_id
from public.appointments a
join public.appointments b
  on a.id < b.id and a.dentist_staff_id = b.dentist_staff_id
  and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
where a.status <> 'cancelled' and b.status <> 'cancelled';
```

## Verification

Use Node 24 and pnpm 11. The appointment tests create synthetic clinics/users and clean up only their own records. SQL tests roll back all fixtures.

```sh
pnpm typecheck
pnpm exec eslint src/features/appointments src/routes/_app.appointments.tsx tests/unit/appointments.test.ts tests/unit/appointment-functions.test.ts tests/integration tests/support tests/e2e/appointments.spec.ts
pnpm exec vitest run tests/unit/appointments.test.ts tests/unit/appointment-functions.test.ts
pnpm db:test
pnpm exec vitest run --config tests/integration/vitest.config.ts
pnpm exec playwright test tests/e2e/appointments.spec.ts
```

The integration/browser fixtures default to the existing local stack on port 55321. To use the separate appointment stack on port 56321, set `APPOINTMENT_SUPABASE_WORKDIR=/private/tmp/dental-appointments-db`. Browser tests require an already running app connected to that same database; use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100` for the isolated worktree. They refuse remote database/application URLs. Existing shared browser fixtures remain unchanged.

Verified results:

- TypeScript and targeted ESLint pass.
- 49 focused unit tests cover time zones/DST (including half-hour shifts and skipped dates), duration/search boundaries, mixed role scopes, dependency failures, source appointment authorization, precise timestamps, concurrency tokens, and safe errors.
- 58 appointment database security/workflow checks pass; the 50 patient and 65 foundation checks pass against the isolated migrated database (173 total).
- 18 real API integration tests pass, including eight simultaneous overlapping requests, cross-branch booking races, dentist swaps, independent/adjacent visits, rescheduling, stale updates, cancellation release, rollback/audits, privileged exclusion enforcement, live permission revocation, forged user metadata, clinic isolation, midnight boundaries, stable calendar pagination, and patient search beyond the first 20 results.
- 11 Chromium Playwright workflows pass, including booking through cancellation, completion with fractional-second timestamps, filters/day/week views, stored UTC values/audits, overlap/stale errors, patient authorization, assistant access, keyboard focus restoration, mobile overflow, patient-search invalidation, cancellation after unsaved edits, failed-save recovery without duplicates, dentist deactivation, midnight boundaries, and calendar pagination.

## Regression fixes found by expanded tests

- Starting a different patient search clears the selected patient ID, so an invisible previous choice cannot remain submit-ready.
- Before editing an appointment, the server reads the existing instant through RLS and checks source-branch management permission. If the local wall time is unchanged, it preserves the exact stored seconds/microseconds, including a uniquely stored instant during a repeated daylight-saving hour. Status changes no longer accidentally reschedule those appointments.
- Ordered dentist advisory locks prevent the GiST deadlocks reproduced under simultaneous booking/rescheduling/swapping. Rejected overlapping requests return the scheduling conflict instead of a generic deadlock failure.
- Foundation SQL appointment fixtures select only their own synthetic patient IDs, allowing the regression checks to run safely alongside persistent demo clinics.

All suites use disposable synthetic clinics and preserve the manual preview accounts and patient records. Browser verification currently covers Chromium; Firefox and WebKit have not been verified. Passing tests establish coverage of the listed cases, not proof that every possible defect has been eliminated.
