# ERP example database

A real Postgres 18 database for the sample ERP: five module schemas plus one legacy schema, seeded deterministically with Dutch, German and English companies, EUR prices and three years of history (up to 2026-10-06).

## Start

```sh
pnpm --filter erp db:up                       # docker compose up, waits until healthy; creates .env from .env.example
pnpm --filter erp db:migrate
pnpm --filter erp db:seed --scale small       # small | medium | large
pnpm --filter erp test                        # smoke test, skipped when the database is unreachable
```

Other scripts: `db:reset` (drop, migrate, seed small), `db:down` (stop; the `pgdata` volume stays, remove it with `docker compose down -v`).

Connection string (port 55432 avoids a local Postgres on 5432):

```
postgres://protobase:protobase@localhost:55432/protobase
```

Scripts read `DATABASE_URL` and fall back to the string above. Credentials live in `.env.example`; the git-ignored `.env` at the repo root is a copy.

## Tables

| Schema | Tables |
| --- | --- |
| `core` | `organizations`, `users`, `countries` (key: ISO code), `currencies` |
| `crm` | `companies` (trigram index on `name`), `people`, `tags`, `company_tags` (join table with `added_by`, `added_at`) |
| `catalog` | `categories` (`parent_id` tree with `position`), `products` (bigint identity, `jsonb attributes`, soft delete via `deleted_at`) |
| `sales` | `orders` (uuid v7 key), `order_lines` (key `(order_id, line_no)`), `invoices` (enum `invoice_status`), `invoice_lines` (`position`, generated `line_total`) |
| `inventory` | `warehouses`, `locations` (`ltree path`), `stock_moves` (append-only, no `updated_at`), `stock_levels` (derived from the moves) |
| `hr` | `"EMP_MASTER"` (legacy, uppercase columns) |

Every table has `organization_id` except `countries`, `currencies` and `organizations` itself. The seed creates two organizations (70/30 split of the volumes) so tenant isolation can be tested.

Seed consistency: an invoice's subtotal equals the sum of its lines and an order's total equals the sum of its lines; `stock_levels` equals the sum of `stock_moves` per product and location and never goes negative. Invoices exist for shipped and delivered orders.

## Scales

| Scale | Companies | Orders | Stock moves | Products | Seed time (Apple silicon, local Docker) |
| --- | --- | --- | --- | --- | --- |
| small | 200 | 2,000 | 20,000 | 200 | under 1 s |
| medium | 20,000 | 200,000 | 1,000,000 | 2,000 | about 15 s (660 MB) |
| large | 20,000 | 200,000 | 10,000,000 | 2,000 | about 47 s (2.8 GB) |

`db:seed` truncates everything first, so it can be re-run or used to switch scale. The loader streams `COPY`, drops secondary indexes during the load and rebuilds them afterwards, skips foreign key triggers (`session_replication_role = replica`), then resets identity sequences and runs `ANALYZE` so `pg_stats` is populated. The scale last seeded is recorded in `public.seed_info`.

## Layout

- `db/migrations/NNN_name.sql`: plain SQL, applied in order and recorded in `public.schema_migrations` by `db/migrate.ts`.
- `seed/`: `world.ts` allocates ids per organization, `builders/` rebuild a company, product or order from its ordinal alone, `steps/` stream one module each.
- `tests/examples/erp/smoke.test.ts` (in the repository root): checks counts, invoice totals, stock levels, composite keys and `pg_stats`.

## Login

`pnpm --filter erp auth:migrate` creates Better Auth's tables in the `auth` schema of the ERP database; `pnpm --filter erp serve` (or `protobase dev`) then needs `BETTER_AUTH_SECRET` in `.env` and serves real sign-in. See [Login with Better Auth](https://docs.protobase.net/reference/auth/). There is no passwordless mode: create the first admin with `protobase users create <email>`, and mint a bearer token for curl with `protobase token <email>`.

## Serve and deploy

The ERP has no server code of its own: `protobase.config.ts` exports the config, `auth` and `authenticate`, and protobase serves it.

```sh
pnpm --filter erp serve    # protobase build, then protobase serve dist on port 8787 (PORT): the UI and the API, from source
```

For a deployment, ship the bundle folder: the host serves its `public/` and runs its config module with the serve runtime under Bun:

```sh
pnpm --filter erp build    # examples/erp/dist/: the config module, the UI in public/ and protobase.bundle.json
pnpm build:serve           # dist/protobase-serve.js at the repository root, the runtime
bun --no-install /opt/protobase/protobase-serve.js /app/protobase.config.js
```

The host passes `DATABASE_URL`, `PORT`, `REQUEST_LOG`, and for password reset `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`; the ERP itself reads `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` and `ADMIN_DATABASE_URL`. Run `auth:migrate` against the database before the first start. The bundle's shape and the runtime's lifecycle are in the [CLI reference](https://docs.protobase.net/reference/cli/#build).
