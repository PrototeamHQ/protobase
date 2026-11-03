---
title: User tables
description: The switch that keeps tables users add in the app's own database, the two schemas they live in, the migration that adds them, and how each one is served.
---

An app's resources usually come from its code: a resource in `config/` over a table a migration made. With user tables on, the app also keeps tables its users add in its own database, and serves each one beside the resources in code.

## Tables defined in the database

:::caution[In development]
The server serves the tables defined in the database, but no screen or API adds one yet.
:::

An app can keep tables its users add in its own database, beside the resources in its code. Each one is served like any other resource, at its own address with its list, record page, search and API. Every server process serves a new table within a second of it being added.

<gap>Tables users add cannot be used in an app with organizations because keeping their definitions and records per organization is not implemented.</gap>

<gap>Users cannot add a table yet because the screens and the API that create one are not implemented.</gap>

### The switch

User tables are off by default. Turn them on in `protobase.config.ts`:

```ts
export default defineConfig({ userTables: true })
```

`userTables` takes only `true` or `false`. Together with organizations (`auth.organizations`), `dev`, `build` and `serve` stop with an error that names both settings.

### The schemas and the migration

The tables users add and their definitions live in two schemas of the app's database, so a table's name can never reach a definition:

| Schema | What it holds |
| --- | --- |
| `table_definitions` | `tables`, one row per table users add, with its singular and plural label, its title field and a version, and `fields`, each table's fields in order with their label, type and whether they are required |
| `user_tables` | the tables themselves, each with an `id bigint generated always as identity` primary key and a column per field |

With `userTables: true`, [`protobase migration`](/reference/cli/#migration) writes a migration that adds both schemas, the two definition tables and the `pg_trgm` extension when it is missing, and grants the app's database role CREATE on `user_tables` alone, and writes nothing once the database has them. Apply it with the project's other migrations; the server never creates them itself. At start, `dev` and `serve` stop while one is missing; `PROTOBASE_STARTUP_CHECKS=false` skips that check in `serve`, as it skips the others.

A table's name and each field's name are lowercase letters, digits and `_`, starting with a letter, at most 63 bytes. A field is one of these types:

| Type | Column |
| --- | --- |
| `text` | `text` |
| `long_text` | `text`, edited in a box that grows with it |
| `integer` | `integer` |
| `decimal` | `numeric`, with the definition's precision and scale |
| `boolean` | `boolean` |
| `date` | `date` |
| `timestamp` | `timestamptz` |
| `json` | `jsonb` |

### How each one is served

When the server starts, and whenever the definitions change, it builds a resource from each definition and serves it at `/<table>` and `/<table>/<key>`, with its list, record page, sidebar entry and REST API, and in `/meta`, as the resources in code are. The labels of the definition are the names the admin app shows.

- **Admins only.** Each table starts readable and writable by admins alone, and is left out of role wildcards such as `*.read`, like [resources that need named grants](/reference/access/#resources-that-need-named-grants). Anyone else does not see it.
- **Filters, sorts and search follow the indexes.** A field can be filtered or sorted by only where an index of its table serves it, and the table is searched on its title field only where a `pg_trgm` index serves that field, as the [scan guard](/reference/config/api/#scanguard) requires.
- **A definition that does not fit is left out.** A definition with a name or type outside the rules above, or whose table or columns do not match it, is not served, and the server prints why at start. The rest of the app serves.
- **Code wins.** A resource in code with the name of a user table, or a resource Protobase adds, is served instead of the definition, which is then ignored with a warning. This is how a table users added is taken over as code.

[`protobase doctor`](/reference/cli/#doctor) checks each definition against the database as it checks the resources in code, and reports each one it leaves out as an error. [`protobase scaffold`](/reference/cli/#scaffold) leaves out the definitions and the tables in `user_tables` that no resource in code claims, and writes and updates the config of one that a resource claims.

### How a change reaches every process

A definition added, changed or removed is served by every process of `serve` and `dev` within a second, with no restart or deploy. Each process rebuilds its API from the resources in code and the definitions as they are now, and the admin app reads `/meta` again once `X-Meta-Version` changes, as after any change of the app.

- **When a process looks.** `/meta` reads the version of the definitions before it answers. Any other request reads it at most once a second, and once more when its answer would be not found or invalid, as for a resource or field the process does not know yet; it is then answered by the API built anew. The process that makes a change rebuilds at once. A process that receives no request reads nothing, so a database that scales to zero stays asleep.
- **What a look costs.** The version is one read of `table_definitions.tables`, under a millisecond. Each change of a definition or its fields must raise the definition's `version`; adding and removing a definition change the version on their own.
- **What a rebuild costs.** A rebuild reads the definitions and the indexes of each table, then builds the API, once per process: requests that need it meanwhile wait for that one rebuild. Requests already running finish on the API they started with, and an open WebSocket keeps the API it opened with. <gap>A channel socket opened before a rebuild cannot hear a broadcast sent through a socket opened after it, in the same process and without a realtime relay, until it reconnects, because moving open sockets to the rebuilt API is not implemented.</gap> <gap>A request whose body is not JSON, such as a file upload, that names a table added under a second ago cannot be answered by the rebuilt API because replaying a streamed body is not implemented; it is answered not found, and works on the next try.</gap>

Measured with six fields per table on one machine running Postgres and the processes:

| Tables users add | Rebuild, one process | Rebuild, each of four processes at once |
| --- | --- | --- |
| 10 | under 0.1 s | under 0.1 s |
| 50 | about 0.1 s | about 0.4 s |
| 200 | about 0.7 s | about 1.4 s |
| 500 | about 2.2 s | about 4.5 s |

- **A rebuild that fails.** When the API does not build with the new definitions, the process reports why through `onUnhandledError`, naming what it refused, and keeps serving the API it had, with the resources in code. A definition that does not fit the database is left out with a warning, as at start.
