# Database Migrations

VHS uses [Knex migrations](https://knexjs.org/guide/migrations.html) to manage PostgreSQL schema. Migration files live under `src/shared/database/migrations/` and are compiled to `build/shared/database/migrations/` for production.

## How Migrations Run

Both the crawler and the connection-manager processes call `initializeDatabase()` on startup (`src/shared/database/initialize.ts`). That helper performs:

1. `knex.migrate.latest()` — applies any migrations not yet recorded in `knex_migrations`.
2. `seedNetworks()` — idempotent `INSERT ... ON CONFLICT DO NOTHING` for the configured network.
3. `addAmendmentsDataFromJSON()` — upserts amendment metadata from the bundled JSON fixtures.

Knex acquires a PostgreSQL advisory lock around `migrate.latest()`, so it is safe for the crawler and connection-manager containers to call it simultaneously on startup — only one runs the migrations, the other waits and then continues.

## Baseline Migration

`20260413000000_baseline.ts` reproduces the live testnet schema as of April 2026. It uses `createTableIfNotExists` for every table, so:

- **On a fresh PostgreSQL volume** (new devnet wipe, future mainnet cold start) the migration creates all 11 tables.
- **On an already-populated DB** (existing devnet, testnet) every `createTableIfNotExists` is a no-op and the migration is recorded as applied without touching data.

All future schema changes go into new numbered migration files. Do not edit the baseline.

## Adding a New Migration

```bash
npx knex migrate:make <name> --knexfile <path-to-config>
```

Or create a file manually at `src/shared/database/migrations/<timestamp>_<name>.ts` following the baseline's structure (`up`, `down`, `Knex` type import). Keep migrations small, numbered, and reversible where possible.

## Deployment

### Devnet (first)

1. Push to the `devnet` branch — GitHub Actions builds the image and deploys via SSH.
2. On container start, `initializeDatabase()` runs. Expected outcomes:
   - `knex_migrations` gains exactly one row: `20260413000000_baseline.js`.
   - No existing data is altered.
   - Crawler resumes its two-minute cycle (`Crawl took X seconds, N peers discovered`).
   - Connection-manager re-opens WSS subscriptions on port 6005 to every validator.
3. Verify with:
   ```bash
   curl -s https://vhs.devnet.postfiat.org/v1/network/topology/nodes | jq '.count'
   curl -s https://vhs.devnet.postfiat.org/v1/network/validators | jq '.count'
   ```
   Counts must match the pre-deploy baseline.

### Testnet (after devnet succeeds)

Testnet hosts a live product and cannot be reset. Promote only after devnet has been validated.

1. Push to the `testnet` branch.
2. Same verification as devnet, against `https://vhs.testnet.postfiat.org`.

## Rollback

If a deploy goes wrong:

1. Redeploy the previous image tag (rerun the prior workflow run, or push a revert commit to the target branch).
2. The orphaned `knex_migrations` table is harmless — it stays in the DB and will be reused by the next successful deploy.
3. No data is dropped or altered by rolling back, because migration #1 only adds tables on empty DBs and records itself on populated ones.

## Fresh Local Setup

```bash
docker run -d --name vhs-postgres \
  -e POSTGRES_USER=vhs_user \
  -e POSTGRES_PASSWORD=vhs_password \
  -e POSTGRES_DB=validator_history_db \
  -p 5432:5432 postgres:16-alpine

cp .env.testnet .env
npm ci && npm run build
npm run startCrawlerDev   # first start runs migrations automatically
```
