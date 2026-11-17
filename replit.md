# HIDDEN GEMS

A social travel discovery app for sharing and finding lesser-known destinations, starting in Kenya.

## Run & Operate

- `pnpm --filter @workspace/hidden-gems run dev` — run the web app
- `pnpm --filter @workspace/api-server run dev` — run the Express API server
- `pnpm run migrate` — apply unapplied Supabase SQL migrations
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate typed API helpers from OpenAPI
- Required secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Later map configuration: `VITE_SATELLITE_TILE_URL` (licensed tile provider)

Do not use Replit Database, Replit Auth, Replit Object Storage, Firebase, or another database/auth system. Supabase is the only application backend.
`SUPABASE_DB_URL` is for migration tooling only. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be bundled into the frontend.

## Stack

- React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide, and React Router
- Supabase PostgreSQL, Auth, Storage, Realtime, RLS, and PostGIS
- Express 5 is limited to privileged server-side operations
- SQL migrations are the database source of truth; do not use Drizzle push for this app
- API contracts live in `lib/api-spec/openapi.yaml`

## Where things live

- `artifacts/hidden-gems/src/` — React app, routes, Supabase client, and auth state
- `artifacts/api-server/src/routes/` and `server/` — Express admin API and database-verified role checks
- `scripts/migrate.ts` — ordered SQL migration runner
- `supabase/migrations/` — versioned Supabase schema, RLS, storage, and seed data
- `lib/api-spec/openapi.yaml` — Express API contract

## Architecture decisions

- Supabase is the only application data/auth/storage backend; the Replit workspace database is not used by HIDDEN GEMS.
- The browser receives only the Supabase URL and anon key; the service-role key stays in the Express server.
- RLS is the primary authorization boundary; the admin API independently verifies the Supabase JWT and checks `user_roles`.
- New places default to pending; approval and rejection are privileged operations.

## Product

- Discover community-submitted destinations, share locations and photos, and interact with places.
- Submissions remain private until an administrator approves them.

## User preferences

- Work one phase at a time and stop for approval before starting the next phase.
- Modify only files required for the active phase; do not build Phase 2 until approved.
- Do not use hardcoded mock records for backend features; show real loading, empty, and error states.

## Gotchas

- Never edit an applied migration; add a new timestamped SQL migration.
- Run `pnpm run migrate` only against the Supabase project configured in `SUPABASE_DB_URL`.
- Do not expose or log secret values. Do not read the service-role key in frontend code.

## Pointers

- See `.local/skills/pnpm-workspace/SKILL.md` for workspace rules.
