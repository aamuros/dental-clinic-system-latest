# Dental Clinic Management System

An internal, invitation-only staff application with verified Supabase sessions, clinic/branch authorization, and patient management. Other business workflows and dashboard metrics remain placeholders.

## Run locally

Prerequisites: Node 24 LTS, pnpm 11, Docker, and Supabase CLI. Verified with Node 24.19.0, pnpm 11.25.0, and Supabase CLI 2.105.0. Install the Supabase CLI using its [official installation instructions](https://supabase.com/docs/guides/local-development/cli/getting-started).

```sh
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:env
pnpm dev
```

Open <http://localhost:3000>. Local Supabase uses isolated ports: API `55321`, database `55322`, Studio `55323`, email testing `55324`, and shadow database `55320`. Another local project can continue using the standard `5432x` ports. Local infrastructure must remain on a trusted development machine/network; the Supabase CLI's containers bind network interfaces by default.

`db:env` creates an ignored `.env.local` containing only the actual local URL and publishable key. It refuses to overwrite an existing file. This workspace has already been configured with its local public values. No account or patient seed is created.

### Environment variables

| Variable                        | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | Local or hosted Supabase project URL                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project's `sb_publishable_…` key, safe for the browser |

Copy `.env.example` to `.env.local` for manual configuration. Zod validates these values before clients are created. This scaffold intentionally accepts modern publishable keys, not legacy JWT-based keys. Missing/invalid configuration disables sign-in and grants no protected access; it does not require fake credentials to build.

Vite substitutes these public values at build time. Rebuild after changing them. Never put secret keys, service-role credentials, database passwords, or access tokens in a `VITE_` variable. The application requires no privileged credentials.

## First administrator and authentication

1. Start the local stack or apply migrations to a separate hosted development project.
2. In local Studio (`http://127.0.0.1:55323`) or the hosted Supabase Dashboard, create an Auth user through the trusted administrator interface. Set an individual password and confirm that account as appropriate. Do not distribute shared credentials.
3. Copy `supabase/bootstrap.sql.example` into the trusted SQL editor. Set `staff_user_id` to that Auth user's UUID and customize clinic, branch, and staff names. Run it once. It creates the first clinic, main branch, active profile, and clinic-wide administrator assignment in one transaction. Running it again for the same user fails and rolls back.
4. Sign in with that user's email and password.

Additional staff are provisioned through the trusted Auth administrator interface, then receive a `staff_profiles` record and explicit `staff_role_assignments`. All non-administrator assignments require a branch. Staff cannot provision or edit access records through the application's database role. A provisioning UI will be added later.

Public signup and anonymous authentication are disabled in `supabase/config.toml`. Keep the email provider enabled (`auth.email.enable_signup = true` in the tested CLI); top-level `auth.enable_signup = false` denies public account registration while permitting provisioned users to sign in. Also disable public signup and anonymous sign-in in **hosted** Supabase Auth settings: local configuration does not automatically configure a hosted project. Set the hosted Site URL and exact permitted redirect URLs for each deployed environment. Review password policy, Auth rate limits, session lifetime, MFA requirements, and account recovery before live clinical use.

There is no registration, invite-email acceptance, or password recovery UI. Password/account assistance currently goes through the clinic administrator. No Resend, email/SMS business notification integration, ORM, or separate backend is included.

### Session behavior

- Browser and server Supabase client utilities are separate. Server clients are created per request and forward refreshed cookies and cache headers.
- `getUser()` verifies identity with Supabase Auth; active staff status and role assignments are then read from protected database records. Editable Auth metadata never grants access.
- A pathless `_app` route checks the session before rendering the workspace. Protected server functions independently enforce authentication through middleware. Route/module guards also guide navigation; they are not the data security boundary.
- Cookies use `SameSite=Lax`, `Path=/`, and `Secure` when the request is HTTPS. The documented browser/server Supabase SSR flow requires browser-readable auth cookies; this is not an HttpOnly server-session architecture.
- TanStack Start CSRF middleware protects server functions. Logout ends the current browser session, clears cookies, and clears Query/Router caches.
- Authenticated users are redirected away from login. Authenticated accounts without active staff assignments remain on an access-restricted login state with a sign-out option.

## Architecture and files

```text
src/
  routes/                  File routes, protected layout, thin page entry points
  features/
    auth/                  Login form, shared Zod schema, logout UI
    dashboard/             Placeholder overview
  components/
    ui/                    Generated shadcn/ui Radix primitives
    layout/                AppSidebar, AppHeader, AppLayout
    shared/                PageHeader, DataTable, EmptyState, LoadingState,
                           ErrorState, ConfirmDialog, StatusBadge, StatCard,
                           SearchInput, theme toggle, module placeholder
  hooks/                   Theme preference hook
  lib/
    auth/                  Central roles, permissions, navigation checks
    supabase/              Browser and request-scoped server clients
    env.ts                 Public environment validation
    navigation.ts          Module navigation definitions
    utils.ts               shadcn utility
  server/
    functions/             Auth and protected workspace server functions
    middleware/            Verified staff access boundary
    services/              Session resolution, scoped authorization, audit interface
  types/                   Auth interfaces and generated database types
  router.tsx               Router and per-request QueryClient
  start.ts                 CSRF and private response/header policy
supabase/
  config.toml
  migrations/              Versioned schema, grants, helpers, and RLS
  tests/                   Transactional pgTAP security tests
  bootstrap.sql.example    Explicit first-administrator setup
scripts/                   Public local env setup, type generation, HTTP verification
tests/
  unit/                    Auth, permissions, and validation
  e2e/                     Optional Playwright browser checks
```

The ten module routes are `/dashboard`, `/patients`, `/appointments`, `/dental-charting`, `/treatments`, `/billing`, `/inventory`, `/staff`, `/reports`, and `/settings`. `/` redirects to the dashboard. Navigation is filtered by permissions; unavailable modules redirect to `/access-denied`.

Auth, dashboard, and patient management have feature implementations. Add each business module under `src/features/<module>` when implementing it, keeping feature-specific schemas/services there and routes thin. Avoid creating empty modules or generic repositories in advance.

The shell includes a collapsible desktop sidebar, accessible mobile drawer, breadcrumbs, user/clinic context, local light/dark preference, loading/error/empty states, and confirmation dialogs. The reusable table uses the installed TanStack Table 9 API. Query is available through a per-request provider; initial workspace data uses Router loaders, with no redundant client cache or persistent private-data cache.

## Permissions and data scope

| Role             | Module access prepared by the scaffold                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Administrator    | Dashboard, Patients, Appointments, Billing, Inventory, Staff, Reports, Settings; clinic-wide audit reads |
| Dentist          | Dashboard, Patients, Appointments, Dental Charting, Treatments, Reports                                  |
| Dental Assistant | Dashboard, Patients, Appointments, clinical read-only modules, Inventory                                 |
| Receptionist     | Dashboard, Patients, Appointments                                                                        |
| Billing Staff    | Dashboard, Patients, Billing, Reports                                                                    |

Patient reads are available to all five roles within their assigned scope. Administrators, dentists, and receptionists can register and edit patients and assign accessible branches. Dental assistants and billing staff have read-only patient access. Other business modules remain placeholders. Administrative privileges do not imply clinical access; a clinician who is also an administrator needs an additional dentist assignment for clinical permissions. Future report endpoints must distinguish clinical and financial data permissions.

### Patient management

`/patients` provides server-side name/contact search, branch filtering, sorting, and pagination (20 records per page). `/patients/new` registers patients; `/patients/:patientId` shows the complete demographic profile and accessible branch associations; `/patients/:patientId/edit` updates it. First/last name and at least one authorized branch are required. Birth date, middle name, gender, phone, email, and address can be left unrecorded. Birth dates must be valid calendar dates from 1900 through today.

Saving checks for case-insensitive matching first/last names, matching email, or matching phone digits among accessible records. Staff review possible duplicates and explicitly confirm before saving a separate record or matching edit. No inaccessible record identities are revealed. Branch assignments are additive: existing associations are retained. A writer must already have write access to a patient before adding another authorized branch. Concurrent edits use `updated_at`; stale edits must reload before saving.

Patient deletion, branch revocation, medical history, dental charting, and patient document workflows are not implemented. Authentication, staff provisioning, and existing development accounts are unchanged. For an existing local database, apply `pnpm db:migrate` before using the module; migrations do not reset or seed accounts.

Staff currently belong to one clinic and can hold multiple explicit branch role assignments. Only administrators may have a clinic-wide assignment. Server resource authorization requires a clinic and branch scope; never trust a submitted clinic/branch identifier without deriving/checking the resource's actual scope. Navigation checks without a resource scope cannot authorize data operations.

## Database foundation

The migration creates `clinics`, `branches`, `staff_profiles`, `staff_role_assignments`, `patients`, `patient_branch_access`, `appointments`, and `audit_logs` with UUIDs, timestamps, indexes, and composite foreign keys preventing cross-clinic references.

Patients contain demographic and contact fields and belong to a clinic. A `patient_branch_access` link explicitly permits a branch to see those details; an unlinked patient remains inaccessible, including to application administrators. Appointments belong to a branch and require a matching patient link. Billing staff cannot read appointment records. Future clinical details must use separate tables and stricter clinical policies; RLS is a row boundary, not field-level protection.

All eight exposed application tables have RLS and explicit grants. Inactive staff and inactive branch assignments lose access based on current database records, without waiting for JWT role refresh. Authorization helper functions live in unexposed `private`, fix `search_path`, and derive identity from `auth.uid()`.

**Direct table mutations remain denied to application users, including administrators.** Patient writes use the narrow `save_patient` RPC: its public entry point is a security invoker, while the private implementation derives the actor and clinic from the current authenticated staff profile, checks live branch/role assignments, validates details, and atomically saves the patient, branch links, and audit events. Reads continue through the existing RLS policies. Other business writes remain unavailable. Keep staff provisioning in the trusted administrative procedure until its own workflow exists.

Audit records have no clinical payload column. Application users cannot directly insert, change, delete, or forge events. The patient RPC appends `patient.created`, `patient.updated`, and `patient.branch_assigned` events in the mutation transaction, including the verified actor, clinic, patient ID, and branch for assignments. `AuditWriter` defines the future service boundary for other workflows. Read/download auditing, retention, archival, and operational log redaction must be implemented with the corresponding workflows.

The `patient-documents` bucket is private, with a 10 MiB limit and PDF/JPEG/PNG types. No object policies are granted yet, so application upload/download/list access is denied. Future document workflows must bind objects to authorized patient records and use short-lived signed access where appropriate.

### Migrations and types

```sh
supabase migration new descriptive_change
pnpm db:migrate
pnpm db:types
pnpm db:test
supabase db lint --local --schema public,private --fail-on warning
supabase db advisors --local --type security --level warn --fail-on warn
```

`db:types` generates `src/types/database.ts` from the actual local schema, buffering output so CLI failure cannot erase the tracked types. Never hand-edit this file. Migration creation and application are explicit; migrations never run on an incoming web request or automatically during a Vercel build.

For a hosted development project, explicitly link the intended project with Supabase CLI, review migration targets and SQL, and run `supabase db push`. Apply the same versioned migrations to production through a reviewed release process. Hosted changes and production data are outside this scaffold's local setup.

## Development and verification commands

| Command                             | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                          | Vite development server on port 3000                                              |
| `pnpm typecheck`                    | Generate routes and run strict TypeScript                                         |
| `pnpm lint`                         | ESLint, TypeScript, and React Hooks checks                                        |
| `pnpm test`                         | Vitest unit tests                                                                 |
| `pnpm format` / `pnpm format:check` | Prettier formatting                                                               |
| `pnpm check`                        | Type checking, lint, and unit tests                                               |
| `pnpm build`                        | Node production build through Nitro                                               |
| `pnpm start`                        | Serve the Node production build                                                   |
| `pnpm build:vercel`                 | Generate the official Nitro Vercel build output                                   |
| `pnpm db:test`                      | Actual local PostgreSQL RLS/grant/constraint tests                                |
| `pnpm test:integration`             | Explicit local HTTP/Auth smoke check against an already running production server |
| `pnpm test:e2e`                     | Optional Playwright checks against an already running application                 |

For HTTP integration verification, start the local Supabase stack, configure `.env.local`, and build. In one terminal run `PORT=3037 HOST=127.0.0.1 pnpm start`; in another run `pnpm test:integration`. The script refuses remote targets, reads privileged **local test credentials into memory only**, creates synthetic staff/workspace fixtures, verifies the actual Auth and server-function flow, and removes those fixtures in `finally`. It never creates patient records or writes credentials/session state to disk.

The browser suite requires the local Supabase stack, Supabase CLI, and an application built with that stack's public configuration. It provisions synthetic staff/workspace and patient fixtures in the isolated local project and removes them after each test/worker, including generated audit events. Privileged test credentials remain in Node memory and are never passed to the browser. Patient tests cover registration, validation, editing, duplicate confirmation, directory controls, branch isolation, read-only roles, branch assignment, audit persistence, stale edits, and mobile layout.

```sh
pnpm exec playwright install chromium
pnpm build
# First terminal:
PORT=3037 HOST=127.0.0.1 pnpm start
# Second terminal:
pnpm test:integration
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3037 pnpm test:e2e
```

`PLAYWRIGHT_BASE_URL` defaults to `http://127.0.0.1:3000` for an already running development app. Authenticated browser fixtures reject remote targets and require this project's local Supabase API on port `55321`. Neither test configuration starts a server automatically. Browser traces, screenshots, and videos are disabled; uncaught browser exceptions and console errors fail the suite.

| Layer                 | Passing checks  | Coverage                                                                                                                                                                                                                                                     |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitest                | 37              | Scoped authorization, verified sessions, inactive/missing staff, backend failures, validation, HTTPS cookie flags, cookie chunks/refresh/deletion, per-request clients, and cache headers                                                                    |
| PostgreSQL / pgTAP    | 65              | All eight tables' RLS/grants, clinic and branch isolation, role escalation/revocation, inactive accounts, restricted audit/Storage access, protected helper functions, cross-clinic foreign keys, uniqueness, appointment constraints, and timestamp updates |
| Playwright / Chromium | 17              | Anonymous and authenticated routes, real login/logout, cookies, reload/history, blocked accounts, deactivation, module navigation, role restrictions, desktop/mobile controls, keyboard focus, theme persistence, and private response headers               |
| HTTP integration      | Full local flow | Direct endpoint denial, CSRF, public-signup rejection, provisioned-user authentication, ten module pages, role/deactivation changes, logout, and cookie clearing                                                                                             |

The database test fixtures are transactional and roll back. Browser and HTTP fixtures use generated identifiers and cleanup routines. No real patient data is used. Future workflows should add tests at their server and database boundaries alongside any browser flow coverage.

## Dependencies and deployment

The repository was initialized using official `@tanstack/cli@0.72.0` with React, Vite, pnpm, ESLint, and Vercel. shadcn/ui was initialized through its official CLI using the Radix Nova preset. Commit `pnpm-lock.yaml` and use frozen installs.

Verified installed core versions: TanStack Start `1.169.3`, Router `1.170.45`, React `19.3.1`, TypeScript `6.0.3`, Vite `8.3.4`, Tailwind `4.3.3`, Query `5.104.4`, Table `9.3.1`, Supabase JS `2.114.0`, and Supabase SSR `0.12.7`. Forms use React Hook Form + Zod; UI uses shadcn/Radix, Lucide, and self-hosted Geist. Vitest and Playwright are development dependencies. `package.json` and the lockfile contain the complete dependency list.

**Accepted exception:** Nitro is pinned to `3.0.260903-beta`. The current [official Vercel guide](https://vercel.com/docs/frameworks/full-stack/tanstack-start) and [TanStack hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) use `nitro/vite`; this is currently a beta deployment dependency. No custom adapter, old Vinxi configuration, or separate backend is used.

Import this repository into Vercel with the TanStack Start framework preset (`vercel.json`), Node 24, pnpm install, and `pnpm build`. Set both public Supabase environment variables to the appropriate **hosted development/preview** project before building; a local Supabase URL cannot serve a Vercel deployment. Keep previews separate from live clinic data. Choose a function region near the Supabase database.

Private pages, auth responses, and server functions send `Cache-Control: private, no-store`. Do not enable ISR, prerender authenticated routes, or add public/CDN cache overrides. The request middleware adds framing, MIME-sniffing, and referrer protections; future scripts and embeds should receive an appropriate full CSP review.

The Nitro/Vite build currently emits upstream warnings about third-party `use client` directives, and the route CLI emits a circular-dependency warning. These do not fail the local builds or checks. Reassess the pinned Nitro version before handling live patient data.

## Verification status and next phase

Verified locally: dependency installation without peer conflicts, strict TypeScript, ESLint, 37 unit tests, 65 real PostgreSQL security tests, 17 Chromium browser tests, SQL lint, security advisor, migration application, generated database types, Node production build, and Vercel build output with Node 24 streaming function metadata. HTTP integration checks against real local Supabase verified all ten module routes, anonymous route and direct-endpoint denial, CSRF rejection, public-signup rejection, provisioned staff login, session cookies, authenticated login redirect, immediate role/deactivation changes, logout, and cookie clearing. Browser tests also verified desktop controls, mobile navigation at 390px, keyboard focus restoration, session persistence through reload, and access rejection after navigating back following logout. Temporary synthetic accounts and workspace records were removed afterward.

Actual hosted Supabase integration and a deployed Vercel preview remain unverified because no hosted project/environment was supplied. Browser verification used Chromium; Firefox/WebKit and visual screenshot comparisons have not been run. A successful local build is not a claim of production clinical readiness.

Patient management now includes demographics, explicit branch linking, server-derived authorization, transactional audits, directory filtering/search, duplicate warnings, and database/server tests. Browser verification adds nine patient workflow tests alongside the 17 existing auth/workspace tests, running against the production build and real local Supabase. Stale edits return an explicit HTTP 409 conflict instead of a retryable transaction error. Appointment scheduling, medical history, dental charting, treatments, billing, inventory, reporting, and notifications remain later phases.

- Email: admin@dental.local
- Password: Bi8nud4zFXGt3yUdLJrYfRKZ!a9
