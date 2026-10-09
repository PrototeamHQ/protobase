# Real estate example database

A real Postgres 18 database for a rental and property management firm: the owners whose homes it lets, the properties and units, leases and tenants, monthly rent and payments, and maintenance. Four module schemas, seeded deterministically with Dutch properties, tenants and vendors, EUR rents and three years of history (up to 2026-10-06).

## Start

The database sits beside the ERP's in the same Postgres container, as `real_estate`, so both examples work at once.

```sh
pnpm db:up                                            # repository root: docker compose up, creates the real_estate database and .env from .env.example
pnpm --filter real-estate db:migrate
pnpm --filter real-estate db:seed --scale small       # small | medium | large
pnpm --filter real-estate test                        # the unit tests next to the config and the seed
```

Other scripts: `db:seed:base` (the amenities and organization 1, named with `--name`: what an app made from the real estate preset starts with), `db:reset` (drop, migrate, seed small), `typecheck`. `pnpm db:down` in the repository root stops the container the ERP shares. The database tests are the repository's `pnpm test:integration`.

Connection string:

```
postgres://protobase:protobase@localhost:55432/real_estate
```

Scripts read `DATABASE_URL` and fall back to the string above. This example keeps its own git-ignored `.env` (a copy of `.env.example`) next to `package.json`: the nearest `.env` wins, so `protobase dev` and `serve` here use the real estate database while the ERP's `.env` points it at its own.

## Tables

| Schema | Tables |
| --- | --- |
| `core` | `organizations`, `users` (role `admin`, `manager`, `finance` or `maintenance`) |
| `portfolio` | `owners`, `properties` (`latitude` and `longitude` columns), `units`, `amenities` (key: code), `unit_amenities` (join table), `valuations` (yearly WOZ value and the odd appraisal) |
| `leasing` | `tenants`, `leases` (no two overlap on a unit: a `btree_gist` exclusion constraint on the unit and `daterange(start_date, end_date)`), `lease_tenants` (primary tenant and co-signers), `deposits` |
| `billing` | `rent_charges` (one per lease and month), `payments`, `arrears` (a view: outstanding balance per lease) |
| `maintenance` | `vendors`, `tickets` (enum `ticket_status`), `work_orders`, `inspections` |

Every table has `organization_id` except `amenities` and `organizations` itself. The seed creates two organizations (70/30 split of the volumes) so tenant isolation can be tested.

Postgres keeps these rules itself, whoever writes:

- A lease that overlaps another on the same unit is refused (`23P01`). `end_date` is the last day of the tenancy, null while an indefinite lease runs.
- `rent_charges.paid_amount` is the sum of the charge's payments, kept by statement triggers on `payments`; a check on it refuses payments that add up to more than the charge.
- `rent_charges.outstanding` is generated (`amount - paid_amount`, stored), so it follows `paid_amount` however that is written and can be filtered, sorted and indexed like any column.
- A ticket's status only moves forward: `reported` to `scheduled` or `cancelled`, `scheduled` to `done` or `cancelled`. Closing it stamps `closed_at`.
- `billing.arrears` reads only the open charges, through a partial index, so it stays quick however much history there is.

Seed consistency: no overlapping leases, payments never exceed their charge, every charge's `outstanding` is its amount minus its payments, the arrears view equals charges minus payments per lease, a unit is `let` exactly when a lease covers the last day, and every lease has one primary tenant and one deposit. Rents rise every 1 July; about one lease in four pays late, some in parts, and a few stop paying.

## Scales

| Scale | Properties | Units | Leases | Rent charges | Payments | Tickets | Seed time (Apple silicon, local Docker) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| small | 60 | 648 | 1,050 | 20,000 | 20,000 | 778 | about 1 s |
| medium | 2,000 | 21,800 | 35,600 | 724,000 | 728,000 | 26,000 | about 23 s (360 MB) |
| large | 10,000 | 107,000 | 175,000 | 3,570,000 | 3,590,000 | 129,000 | not timed since foreign keys are checked (1.7 GB) |

`db:seed` truncates everything first, so it can be re-run or used to switch scale. Like the ERP's, the loader streams `COPY`, drops secondary indexes during the load and rebuilds them afterwards, switches the tables' own triggers off (so it writes `paid_amount` itself), then resets identity sequences and runs `ANALYZE`. Foreign keys are checked throughout: the role an app gets may not skip them. The scale last seeded is recorded in `public.seed_info`.

## Layout

- `db/migrations/NNN_name.sql`: plain SQL, applied in order and recorded in `public.schema_migrations` by `db/migrate.ts`. The database itself comes from its host: `pnpm db:up` here.
- `seed/`: `world.ts` allocates ids per organization, `builders/` rebuild a property, unit, lease, rent ledger or ticket from its ordinal alone, `steps/` stream one module each. `base.ts` is the base seed.
- `AGENTS.md`: the rules for the assistant that changes an app made from this example, which is also the real estate preset (`packages/presets`; the preset leaves this README out).
- `config/`: one folder per table (`data.ts`, `ui.ts`), the roles, and the overview page (occupancy, arrears, open tickets).
- `tests/examples/real-estate/` (in the repository root): `smoke.test.ts` checks counts and the consistency rules, `rules.integration.test.ts` that Postgres refuses an overlapping lease, an overpayment and a backward ticket step, `access.integration.test.ts` what each role and organization sees, who may reveal an IBAN and the record pages' related records, `server.integration.test.ts` builds and serves the example and loads its pages.

## Roles

| Role | Works on |
| --- | --- |
| `admin` | everything |
| `manager` | the portfolio, tenants and leases, tickets and inspections; reads rent, payments and arrears |
| `finance` | rent charges, payments, deposits and valuations; reads leases, tenants and the portfolio |
| `maintenance` | tickets (changes only those assigned to them), work orders, inspections and vendors; reads properties, units and tenants, without their income and IBAN |

A tenant's IBAN is a [sensitive field](https://docs.protobase.net/reference/data-config/#sensitive-fields): no list or record carries it, and managers and finance reveal it one tenant at a time with the eye button on the record page. Every reveal publishes an audit event; this example keeps the default queue, which prints it on the server console as an `[audit]` line. A tenant's page lists the homes they rent through their leases, current leases first, and a unit's page who it is let to (the primary tenant and co-signers) and the running lease, or that it is vacant ([related records](https://docs.protobase.net/reference/ui-config/#related-records)).

## Login

`pnpm --filter real-estate auth:migrate` creates Better Auth's tables in the `auth` schema of the real estate database; `pnpm --filter real-estate dev` (http://localhost:5173) or `serve` then needs `BETTER_AUTH_SECRET` in `.env`. Create the first admin with `pnpm --filter real-estate protobase users create you@example.com --role admin --generate-password`. See [Login with Better Auth](https://docs.protobase.net/reference/auth/).

## Serve and deploy

```sh
pnpm --filter real-estate serve    # protobase build, then protobase serve dist on port 8787 (PORT)
```

The ERP's `serve` uses the same port, so run one at a time or set `PORT` in this example's `.env`. Deploying works as for the ERP; see [its README](../erp/README.md#serve-and-deploy) and the [CLI reference](https://docs.protobase.net/reference/cli/#build).
