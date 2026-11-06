# Delivery Platform Backend

NestJS 12 modular-monolith API for the Delivery Platform. The current implementation covers
a partial backend foundation: authentication, unified users, business
capabilities, addresses/regions, tenant-scoped zones/pricing, health, and the delivery
lifecycle foundation.

Driver assignment, driver transition endpoints, realtime tracking, finance/settlements,
notifications, dashboards, and mobile product features are intentionally not implemented.

Current status is owned by [the root canonical plan](../docs/implementation_roadmap.md). Read [root AGENTS](../AGENTS.md) and [memory](../docs/memory/README.md) before changes. Business ORM mapping is corrected and covered by isolated migrated-PostGIS tests (F01). Refresh SQL still requires F02; local tests do not establish full-AppModule readiness. See [audit baseline](../docs/audits/2026-09-13-project-baseline.md).

## Requirements

- Node.js compatible with the repository lockfile
- PostgreSQL 16 with PostGIS 3.4
- Redis 7 (used by the default development OTP state)
- Docker Engine with Compose v2 for the repeatable local stack and integration suite

## Configuration

Copy the root `.env.example` values into `delivery-backend/.env`. Outside `APP_ENV=test`,
startup requires explicit database settings and two different JWT access/refresh secrets of
at least 32 characters. Validation rejects known/published placeholder wording (including the
exact strings shipped in `.env.example`), not just length and a short exact-match blacklist
(F03, 2026-09-13). Provision real, distinct secrets for any shared/deployed environment; never
commit them. `DB_PASSWORD` in `.env.example` intentionally matches the local Compose default
(`postgres`) so local setup works out of the box — replace it for anything beyond local dev.
`APP_HOST` controls the listen interface. `CORS_ORIGINS` is an optional comma-separated
allowlist of exact browser origins; wildcard, credential-bearing and path-bearing values
are rejected.

The local Compose database uses:

```text
DB_HOST=localhost
DB_PORT=5432
DB_NAME=delivery_db
DB_USER=postgres
```

## Install and run

```bash
npm install
npm run build
npm run migration:run
npm run start:dev
```

The health endpoint is `GET /health`. For the repeatable Compose launch, non-production
fixture seed, public/401/login/bearer smoke and full stage gate, follow the
[API E2E runbook](../docs/api_e2e_runbook.md).

OpenAPI is generated from the compiled application at `openapi.json`, served at `/docs-json`
and `/docs`, and validated with Redocly. `npm run contracts:generate` rebuilds the API,
generates and validates the document, and refreshes the checked TypeScript declarations in
the three client applications. Client callers can use `requestContract(path, method, options)`
for request bodies and successful responses derived from that document; access-token
injection, origin-relative path checks and platform-specific token storage remain owned by
each client foundation.

See the [entity relationship map and review](../docs/backend_entity_relations.md)
for FK ownership, inverse navigation, circular import avoidance, soft-delete
handling and snapshot immutability. The relationship integration suite also
starts the compiled backend; run `npm run build` before `npm run test:integration`.

## Verification

```bash
npm run build
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e
```

For the contract-specific checks, run `npm run contracts:generate` and
`npm run openapi:verify-live` against the running local API. The latter compares the live
`/docs-json` route set and schemas, validates the live document, and checks database health.

The fast E2E suite uses an isolated Nest HTTP application with mocked persistence. The
integration suite separately boots the real AppModule and compiled TCP entrypoint against
fresh migrated PostGIS, including the public/401/password-login/bearer baseline path.

`npm run test:integration` runs the Business/schema regression suite against a fresh temporary PostGIS16/3.4 Docker container, applying all existing migrations with synchronize disabled. Run from this backend directory using Node24 and an available Docker daemon/local `postgis/postgis:16-3.4` image. The suite does not pull images, read application DB settings, mount project volumes or touch the development database. It uses a random password, loopback ephemeral port and tmpfs storage, then removes its container. Missing Docker/image fails the suite rather than silently skipping it. This is focused real-repository coverage; it is not yet the full AppModule/CI suite.

## API conventions

- Protected routes use bearer access tokens and load an active `User`.
- Business scope is derived from the requested resource and an active `BusinessMember`, not
  from a client-provided header/body/query value.
- Current collections accept `take` and `skip`, cap `take` at 100, and return
  `{ items, take, skip }`.
- UUID route parameters fail fast with HTTP 400.
- Monetary values are integer minor-unit strings; floating-point money is not accepted.
- Controllers return explicit response DTOs/serializers. Password hashes, refresh-token
  hashes, OTPs, and secure tracking tokens are never returned.

## Database changes

Schema changes are migration-only; `synchronize` remains disabled. The Phase 0–4
stabilization migration adds delivery optimistic versioning, approved status/range/invariant
checks, geometry/coordinate checks, active-delivery indexes, owner lookup support, and
immutability triggers for delivery snapshots/history.

Every database column uses the exact entity field spelling, including `businessId`,
`userId` and `createdAt`. Double-quote camelCase column identifiers in raw PostgreSQL
SQL. Migration1700000000007 reversibly renames 84 legacy columns while preserving
rows and FK/index/trigger definitions. Run `npm run migration:run` before starting
the updated backend against an older database; `synchronize` remains disabled.
See [ADR-26](../docs/decisions.md#adr-26-identical-camelcase-entity-fields-and-database-columns).

See the root `docs/` and `docs/memory/` directories before making implementation changes.
