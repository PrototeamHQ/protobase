---
title: User tables
description: The switch that keeps tables users add in the app's own database, the two schemas they live in, the migration that adds them, how each one is served, and how a developer takes one over as code.
---

An app's resources usually come from its code: a resource in `config/` over a table a migration made. With user tables on, the app also keeps tables its users add in its own database, and serves each one beside the resources in code.

## Tables defined in the database

:::caution[Beta]
Tables are added through the API; the admin app has no screens for them yet.
:::

An app can keep tables its users add in its own database, beside the resources in its code. Each one is served like any other resource, at its own address with its list, record page, search and API. Every server process serves a new table within a second of it being added.

<gap>Users cannot add a table from the admin app yet because its screens for tables and fields are not implemented.</gap>

### The switch

User tables are off by default. Turn them on in `protobase.config.ts`:

```ts
export default defineConfig({ userTables: true })
```

`userTables` takes only `true` or `false`. With [organizations](#organizations), each organization keeps its own tables. An API that trusts the organization tokens of an auth server elsewhere (`authenticate.organizations` without `auth.organizations`) cannot read who manages an organization, so there `dev`, `build` and `serve` stop with an error that names both settings.

### The schemas and the migration

The tables users add and their definitions live in two schemas of the app's database, so a table's name can never reach a definition:

| Schema | What it holds |
| --- | --- |
| `table_definitions` | `tables`, one row per table users add, with its singular and plural label, its title field, a version, 1 when it is added, its organization with organizations, and its table's name, and `fields`, each table's fields in order with their label, type and whether they are required |
| `user_tables` | the tables themselves, each with an `id bigint generated always as identity` primary key and a column per field, and with organizations an `organization_id` column |

With `userTables: true`, [`protobase migration`](/reference/cli/#migration) writes a migration that adds both schemas, the two definition tables and the `pg_trgm` extension when it is missing, and grants the app's database role CREATE on `user_tables` alone, and writes nothing once the database has them. Apply it with the project's other migrations; the server never creates them itself. At start, `dev` and `serve` stop while one is missing; `PROTOBASE_STARTUP_CHECKS=false` skips that check in `serve`, as it skips the others.

A table's name and each field's name are lowercase letters, digits and `_`, starting with a letter, at most 63 bytes. A field is one of these types:

| Type | Column |
| --- | --- |
| `text` | `text`, at most 500 characters |
| `long_text` | `text`, edited in a box that grows with it |
| `integer` | `integer` |
| `decimal` | `numeric`, with the definition's precision and scale |
| `boolean` | `boolean` |
| `date` | `date` |
| `timestamp` | `timestamptz` |
| `json` | `jsonb` |

### How each one is served

When the server starts, and whenever the definitions change, it builds a resource from each definition and serves it at `/<table>` and `/<table>/<key>`, with its list, record page, sidebar entry and REST API, and in `/meta`, as the resources in code are. The labels of the definition are the names the admin app shows.

- **Admins only.** Each table starts readable and writable by admins alone, and is left out of role wildcards such as `*.read`, like [resources that need named grants](/reference/access/#resources-that-need-named-grants). Anyone else does not see it. With organizations, [its organization's owners and admins](#organizations).
- **Filters, sorts and search follow the indexes.** A field can be filtered or sorted by only where an index of its table serves it, and the table is searched on its title field only where a `pg_trgm` index serves that field, as the [scan guard](/reference/config/api/#scanguard) requires.
- **A definition that does not fit is left out.** A definition with a name or type outside the rules above, or whose table or columns do not match it, is not served, and the server prints why at start. The rest of the app serves.
- **Code wins.** A resource in code with the name of a user table, or a resource Protobase adds, is served instead of the definition, which is then ignored with a warning. This is how a table users added is taken over as code.

[`protobase doctor`](/reference/cli/#doctor) checks each definition against the database as it checks the resources in code, reports each one it leaves out as an error, and checks a table a resource in code has taken over as that resource. [`protobase scaffold`](/reference/cli/#scaffold) leaves out the definitions and the tables in `user_tables` that no resource in code claims, and writes and updates the config of one that a resource claims.

### How a change reaches every process

A definition added, changed or removed is served by every process of `serve` and `dev` within a second, with no restart or deploy. Each process rebuilds its API from the resources in code and the definitions as they are now, and the admin app reads `/meta` again once `X-Meta-Version` changes, as after any change of the app.

- **When a process looks.** `/meta` reads the version of the definitions before it answers. Any other request reads it at most once a second, and once more when its answer would be not found or invalid, as for a resource or field the process does not know yet; it is then answered by the API built anew. The process that makes a change rebuilds at once. A process that receives no request reads nothing, so a database that scales to zero stays asleep.
- **What a look costs.** The version is one read of `table_definitions.tables`, under a millisecond. Each change of a definition or its fields must raise the definition's `version`, as the [API](#adding-tables-and-fields) does; adding and removing a definition change the version on their own.
- **What a rebuild costs.** A rebuild reads the definitions and the indexes of each table, then builds the API, once per process: requests that need it meanwhile wait for that one rebuild. Requests already running finish on the API they started with, and an open WebSocket keeps the API it opened with. <gap>A channel socket opened before a rebuild cannot hear a broadcast sent through a socket opened after it, in the same process and without a realtime relay, until it reconnects, because moving open sockets to the rebuilt API is not implemented.</gap> <gap>A request whose body is not JSON, such as a file upload, that names a table added under a second ago cannot be answered by the rebuilt API because replaying a streamed body is not implemented; it is answered not found, and works on the next try.</gap>

Measured with six fields per table on one machine running Postgres and the processes:

| Tables users add | Rebuild, one process | Rebuild, each of four processes at once |
| --- | --- | --- |
| 10 | under 0.1 s | under 0.1 s |
| 50 | about 0.1 s | about 0.4 s |
| 200 | about 0.7 s | about 1.4 s |
| 500 | about 2.2 s | about 4.5 s |

- **A rebuild that fails.** When the API does not build with the new definitions, the process reports why through `onUnhandledError`, naming what it refused, and keeps serving the API it had, with the resources in code. A definition that does not fit the database is left out with a warning, as at start.

## Adding tables and fields

:::caution[Beta]
Tables and fields are added through the API alone, and are never renamed, retyped or removed.
:::

Someone with the right capability creates a table with its fields, or adds a field to it, through the app's API. It is created in the database at once, with an index for every field but JSON so its list can be filtered by it, and sorted by it unless it is long text, and only admins can see it until access is widened.

With `userTables: true`, the API has two resources over the definitions, with the standard addresses and routes of the [API](/reference/api/#routes):

| Resource | A record | Fields |
| --- | --- | --- |
| `user_tables` | a table, at `/user_tables/<id>` | `name`, `singular_label`, `plural_label`, `title_field`; `id`, `version` and `table_name`, the name of its table and its address, are read-only |
| `user_table_fields` | a field of a table, at `/user_table_fields/<table_id>,<name>` | `table_id`, `name`, `label`, `type` (one of the [types](#the-schemas-and-the-migration)), `position` (the order of the fields), `precision` and `scale` (a decimal's alone) |

Make a table with its fields in one [batch write](/reference/api/#batch-writes): the table, each field pointing at it, then the title field, which names a field that exists. Nothing is created unless all of it is:

```json
POST /api/v1:batchWrite
{
  "ops": [
    { "op": "create", "resource": "user_tables", "ref": "notes", "data": { "name": "notes", "singular_label": "Note", "plural_label": "Notes" } },
    { "op": "create", "resource": "user_table_fields", "data": { "table_id": { "$ref": "notes" }, "name": "title", "label": "Title", "type": "text", "position": 1 } },
    { "op": "create", "resource": "user_table_fields", "data": { "table_id": { "$ref": "notes" }, "name": "price", "label": "Price", "type": "decimal", "precision": 12, "scale": 2, "position": 2 } },
    { "op": "update", "resource": "user_tables", "key": { "$ref": "notes" }, "etag": "*", "data": { "title_field": "title" } }
  ]
}
```

The answer has the table's record, so a client links to the new table at its `table_name`, `/notes`. Add a field later with `POST /api/v1/user_table_fields`.

- **What is created.** A table is `user_tables.<name>` with its `id bigint generated always as identity` key. A field is a column of its type that may be empty and has no default, so the records already there read it as empty, with a btree index, or a `pg_trgm` one for `long_text`, whose values outgrow a btree entry; a `json` field gets none. The title field gets the `pg_trgm` index search needs. The rows, the table or column, its indexes and the version are written in one transaction: anything refused leaves none of them.
- **What is refused.** A name outside the rules above, a word SQL reserves such as `select`, a field named `id`, `etag` or `organization_id`, the name of a resource in code, of one Protobase adds or of a table `user_tables` already has, a field marked required, and a title that is not a text field of the table, each as a field error. A table whose name a resource in code has now, which is how a table is taken over as code, takes no new field.
- **What changes later.** The labels, the title field and the fields' order. A name, a type, a decimal's precision and scale never change, and no table or field is deleted. <gap>A table or field cannot be renamed, retyped or removed because changing the columns of a table users add is not implemented.</gap>
- **Who may.** With the project's [roles](/reference/access/), the capabilities `user_tables.create` and `user_table_fields.create`, which only `*` or a grant that names them holds, never a wildcard such as `*.create`, like [resources that need named grants](/reference/access/#resources-that-need-named-grants); reading and changing the labels need `.read` and `.update` the same way. Without roles, admins. Each new table is its admins' alone, as [each one served](#how-each-one-is-served) is.
- **The rest of the app.** The process that made the change serves it before it answers, and every other process [within a second](#how-a-change-reaches-every-process). While a deploy freezes writes, a create answers as any write does then.

Building an index holds the table's write lock, and every statement runs within the request's statement timeout (1 s by default). <gap>Adding a field to a table with very many records cannot finish when building its index takes longer than the statement timeout, because building it outside the request is not implemented; the field is then not added.</gap>

## Taking a table over as code

:::caution[Beta]
A table is taken over from the command line alone, keeps its name and stays in `user_tables`.
:::

`protobase eject` turns a table someone added in the admin app into ordinary config and a migration in the project, so a developer can customise it like any other resource. Its records stay where they are.

When a table needs more than the admin app gives it, such as a validation rule, a view per role or an action, [`protobase eject <table>`](/reference/cli/#eject) writes its `config/<table>/data.ts` and `ui.ts`, as the server serves it from its definition, and a migration that makes the table as it is. The resource reads `user_tables.<table>`, where the table already is, so the deploy that brings the code moves no row: the migration changes nothing on that database and makes the same table on an empty one, such as a developer's. From then on it is a resource like any other, and the config is yours to change.

1. **Get the project and its database.** For an app you host yourself, work in its repository with its database URL in `DATABASE_URL`, or pass the URL as the first argument. For an app on Protobase Cloud, clone the repository the app deploys from and use the app's database URL.
2. **Eject.** Run `protobase eject <table>`, or name several tables. It runs [`doctor`](/reference/cli/#doctor) on what it wrote and puts every file back when doctor fails.
3. **Deploy soon.** Commit the files and deploy as usual: for an app on Protobase Cloud, push to the branch it follows (see [Protobase Cloud](/guides/deploy/#protobase-cloud)). Until the new version serves, the admin app still adds fields to the table, which the new config does not have: add such a field with [`protobase scaffold user_tables.<table>`](/reference/cli/#scaffold) and a migration of its own that adds the column.
4. **Delete the definition in a later deploy.** Once the code has deployed, run [`protobase migration`](/reference/cli/#migration): it writes the delete of each definition whose table a resource in code reads under the same name (`NNN_owned_definitions.sql`), which goes out with the next deploy. Its table and rows stay. Until then the server ignores the definition, as [code wins](#how-each-one-is-served), and doctor warns about it. <gap>`protobase migration` cannot hold the delete back when it runs before the eject has deployed because telling which version serves is not implemented; the old version then stops serving the table for the moment before the new one serves.</gap>

Once the code serves, the table takes no new field from the admin app, and a new table cannot take its name. The resource starts as the admins' alone, as it was served; widen its access in `data.ts` as for any resource.

<gap>A table cannot be taken over from the admin app or the assistant because an eject that writes to the project's repository is not implemented.</gap>

## Organizations

:::caution[Beta]
A table belongs to one organization and is never shared with another. Only the organization's owners and admins reach it; access cannot be widened to its other members yet.
:::

In an app with organizations, a table someone adds belongs to their organization. Only its owners and admins, and superusers working in it, see the table and its records.

- **Who makes and sees them.** The owners and admins of the organization a session works in, as its [organization role](/reference/auth/#organizations) stands on that request, and superusers working in it. They make a table, add its fields and work with its records as [above](#adding-tables-and-fields); the project's roles and their capabilities do not widen it. Anyone else, in another organization or in none, gets not found at its address, and does not see it in `/meta`, the sidebar, search, the API document or the assistant. A member who is demoted or removed loses it on their next request. <gap>Members of an organization other than its owners and admins cannot see its tables because widening their access is not implemented.</gap>
- **Its records.** Each table is a `.tenant` resource over its `organization_id` column, as [organizations](/reference/auth/#organizations) describe: the server sets it on every record from the session, a request body cannot, and every query reads only the organization's own.
- **Names.** A name is unique within an organization, so two organizations can each have a `contacts` table. Its table, and its address, is `t<id>_<name>`, such as `/t12_contacts`, with `<id>` the definition's; the labels the app shows are the ones it was given. With organizations a table's name is at most 42 bytes, and may be the name of a resource in code.
- **Taking one over as code.** `protobase eject` refuses an organization's table, as the resource it writes would not keep its records in the organization. Declare a resource over its table instead, such as `resource('t12_contacts').table('user_tables.t12_contacts')`, and run [`protobase scaffold`](/reference/cli/#scaffold): it adds the fields and `.tenant((r) => r.organization_id)`, so the records stay in their organization, and prints which organization's definition it took. The resource in code follows the project's access rules, not the owners-and-admins rule the definition had, so give it the `.access(...)` it needs.
- **A table made before organizations.** One added while the app had no organizations belongs to none, and stays its superusers' alone.

Every process serves the tables of every organization, so [a rebuild](#how-a-change-reaches-every-process) follows a change in any organization, and the times measured there count the tables of all organizations together.
