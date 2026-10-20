# Repository Guidelines

## Project Structure & Module Organization

This invitation-only dental staff application uses TanStack Start, React, TypeScript, and Supabase. Auth and dashboard are implemented; business modules remain placeholders.

- `src/routes/`: file-based routes and protected layouts; keep page entry points thin.
- `src/features/<module>/`: feature components, schemas, and services.
- `src/components/`: shared UI, layout components, and shadcn/Radix primitives.
- `src/server/`: server functions, authentication middleware, and authorization services.
- `src/lib/`: permissions, environment validation, and Supabase clients.
- `src/styles.css`: global styles; Geist fonts come from `@fontsource-variable/geist`.
- `supabase/migrations/` and `supabase/tests/`: schema changes and database tests.
- `tests/unit/` and `tests/e2e/`: unit and browser tests; `scripts/` contains local tooling.

## Build, Test, and Development Commands

Use Node 24 and pnpm 11.

- `pnpm install --frozen-lockfile`: install locked dependencies.
- `pnpm db:start` then `pnpm db:env`: start local Supabase using Docker and create local configuration.
- `pnpm dev`: serve development on port 3000.
- `pnpm build` then `pnpm start`: build and serve production locally.
- `pnpm typecheck`: regenerate routes and check TypeScript.
- `pnpm lint`: run ESLint and React Hooks checks.
- `pnpm test`: run Vitest unit tests.
- `pnpm format:check`: check Prettier formatting; `pnpm format` applies it.
- `pnpm check`: run typecheck, lint, and unit tests together.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, no semicolons, and trailing commas. Follow Prettier and ESLint. Use kebab-case filenames, PascalCase React components, and `use`-prefixed hooks. Preserve TanStack route naming conventions. Never hand-edit `src/routeTree.gen.ts` or `src/types/database.ts`; regenerate database types with `pnpm db:types`.

## Testing Guidelines

Name Vitest tests `*.test.ts` and Playwright tests `*.spec.ts`. Run focused tests with `pnpm test -- tests/unit/permissions.test.ts`. Database changes require `pnpm db:test` against local Supabase. Cover authorization and clinic/branch isolation; no numeric coverage threshold is configured. Use synthetic fixtures only. Run `pnpm test:e2e` only when browser verification is requested; it requires an already running app and local Supabase.

## Commit & Pull Request Guidelines

There is no commit history yet. Prefer concise, imperative subjects such as `Add patient validation`. Keep changes focused. PRs should explain behavior, link relevant issues, list verification results, and include screenshots for UI changes when available.

## Security & Configuration

Keep secrets in ignored local configuration. Never place privileged credentials in `VITE_` variables. Enforce authorization server-side and through database policies; navigation visibility does not authorize data access.
