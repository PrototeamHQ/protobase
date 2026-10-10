---
title: REST API
description: The REST API that @protobase/server generates, with its routes, access, filters, writes, batches and errors.
---

`@protobase/server` turns resource definitions into a Hono app that follows Google's API design conventions ([AIP-131 to 136](https://google.aip.dev/131), [158](https://google.aip.dev/158), [160](https://google.aip.dev/160)). It uses Web APIs only and runs on Node and Workers; the Node adapter lives in the example.

```ts
import { configExports, createAdmin } from '@protobase/server'
import { auth, authenticate } from './auth/auth' // Better Auth, see /reference/auth/
import * as config from './config'

const { resources, views } = configExports(config) // splits a config's index.ts exports
const admin = createAdmin({
  resources,
  views,                                            // optional, served by /meta
  db,                                               // Kysely<any> on Postgres
  authenticate,                                     // required: there is no anonymous or development mode
  auth,                                             // optional: mounts login at /api/auth/*
  options: { statementTimeoutMs: 15_000, scanGuard: { mode: 'reject' } },
})
```

Run the ERP example with `bun run --cwd examples/erp serve` (port 8787, Better Auth login, organization 1 as tenant; `REQUEST_LOG=1` logs requests). Interactive reference: `/api/docs`; like `/api/openapi.json` it needs a bearer token, because the document lists what the caller may see and do. Every route answers `401` without a valid token; get one with `protobase token you@example.com`.

## Routes

`/api/v1/*` is resources only, so a table may be called `meta` or `docs`. The system endpoints (`/api/meta`, `/api/openapi.json`, `/api/docs`) and login (`/api/auth/*`) live beside it; the parent of `options.basePath` is where the system endpoints go.

Under `/api/v1`:

| Route | |
| --- | --- |
| `GET /{resource}` | list: `filter`, `order_by`, `page_size` (50, max 500), `page_token`, `fields`, `count=exact` |
| `POST /{resource}:search` | same parameters as a JSON body (`fields` an array), for long filters |
| `GET /{resource}/{key}` | one record, with `ETag`; composite keys are `part,part`, each part percent-encoded |
| `POST /{resource}` | create, `201` with `Location` and `ETag` |
| `PATCH /{resource}/{key}` | partial update, `If-Match` required |
| `DELETE /{resource}/{key}` | soft delete when the resource has one ([AIP-135](https://google.aip.dev/135)); `If-Match` optional |
| `POST /{resource}/{key}:reveal` | `{ "field": "iban" }` gives `{ field, value }` of one [sensitive field](#sensitive-fields-and-audit), with `Cache-Control: no-store`, and publishes an audit event |
| `POST /{resource}/{key}:undelete` | restores a soft-deleted record ([AIP-164](https://google.aip.dev/164)); `If-Match` optional; `409` when not deleted, `400` on hard-delete resources |
| `POST /api/v1:batchWrite` | many writes in one transaction, see [Batch writes](#batch-writes) |
| `GET /{resource}:facets?field=&filter=&limit=` | `{ field, facets: [{ value, count }] }` |
| `GET /{resource}:series?field=&range=&granularity=&time_zone=&filter=` | `range` is `7d`, `30d`, `90d`, `1y`, `all`, or `from` and `to` (ISO) |
| `GET /{resource}:histogram?field=&buckets=&filter=` | equal-width buckets of a numeric field |
| `GET /{resource}:seek?position=&order_by=&filter=&page_size=&fields=` | the page at a row position (scrollbar jumps), with `next_page_token` and `prev_page_token`; same items as a list |
| `GET /api/meta` | resource, view and page models (fields carry `default`: `{ value }` or `{ db: true }`) and the caller's `permissions`; the `ETag` hashes both, so it differs per user; `If-None-Match` gives `304` |
| `GET /api/openapi.json`, `GET /api/docs` | OpenAPI 3.1 for the caller (only the resources, fields and operations their roles allow), and the Scalar reference |

Every response carries `X-Meta-Version`, the hash of the models and of the caller's roles; a client that sees it change (a model edit, a role change) refetches `/meta`.

`show_deleted=true` on list, `:search` (body) and get also returns soft-deleted records (soft-delete resources only, `400` otherwise).

A list returns `{ items, next_page_token, total_size_estimate }` (`total_size` with `count=exact`). `next_page_token` is `""` on the last page. Items use field names, dates as ISO 8601 text, 64-bit integers and decimals as strings.

## Access

Access is resolved once per request and resource (`resolveAccess`, see [Login with Better Auth](/reference/auth/) for roles and capabilities), and everything downstream uses the result:

- **Operations**: a denied operation is `403`; a resource the caller can do nothing with does not exist for them (`404` everywhere, absent from `/meta` and the OpenAPI document).
- **Readable fields**: the caller works with a restricted model that has only the fields they may read. `filter`, `order_by`, `fields`, `search(...)`, `:facets`, ``:histogram`, `:series`, `:seek` and `:search` bodies are checked against it, so a hidden field is refused exactly like an unknown one (same status, same message and hint, nothing that says it exists). List, get, create, update and delete responses contain readable fields only, and queries select only those columns.
- **Sensitive fields** are readable fields that no response carries and no request may name, except `:reveal`; they can be written. See [Sensitive fields and audit](#sensitive-fields-and-audit).
- **Writable fields**: only fields the caller may write (and read) are accepted; any other is `400`, worded as unknown (hidden) or read-only. Nobody writes a field blind.
- **Row filters**: a rule that returns a filter (`.own`, `.team`) narrows every read (list, get, aggregates) and the rows a write may target; the database applies it, so it may use columns the caller cannot see. A row outside it is a `404`.
- **Record-level rules** (a rule that needs the record, such as `status != 'locked'`) run in the write transaction with the stored record; a filter they return is checked in the database against the row as written, and a miss rolls the write back with `403`.
- **`.own` on create**: when the create rule is limited to rows, the owner field is set to the caller unless given, and a row owned by someone else is refused with `403`.
- **Seeking**: `:seek` resolves a row position to a page on the server, inside the caller's tenant, row filter and filter. No anchor value, column statistic or boundary token is ever returned (table-wide statistics include rows the caller may not see), only the page and the tokens of its own rows.
- **ETags**: with a read-only `version` or `updated_at` column the ETag is a hash of that column's exact text, so it never shows a hidden value yet moves on every change. Without one it is a hash of the fields the caller may read, sensitive ones excluded: a change to a field they cannot read, or to a sensitive field, does not change their ETag.
- **Errors** never contain values of fields the caller cannot read; database errors leave out constraint and column names.

`options.roles` (from `defineRoles`) makes an operation without an explicit rule need the matching capability (`orders.update`); `options.defaultAccess: 'allow' | 'deny'` overrides that. Without either, operations without a rule are allowed (single-admin projects).

### Record permissions

Get responses carry `permissions: { update, delete, fields }`, where `fields` maps each readable field to `edit` or `read` for this record (hidden fields are not listed). List items carry `permissions: { update, delete }` too, decided in the database in one extra query per page; turn it off for a resource with `options.rowPermissions: { except: ['resource'] }` (or `false` for all). They only inform the UI: every write is checked again. A resource cannot have a field named `permissions` or `etag`.

### `/meta` and OpenAPI per caller

`/meta` returns, per caller: the resources they can do anything with as restricted models (hidden fields absent, `readOnly` unless writable), the view for their roles (`pickView`) with every reference to a hidden field removed (columns, sort, search, filters, layout, chart, title, search result) and the [related sections](/reference/ui-config/#related-records) they cannot use, `permissions[resource]` as `{ read, create, update, delete, conditional }`, the [user menu](/reference/user-menu/) as `userMenu` without the resources and pages they cannot see, and the [composed pages](/reference/layouts/#access) as `pages`, each without the elements that name what they cannot see or do, and, for a caller with the `admin` or `ai` role, the [assistant](/reference/assistant/#who-sees-it) backend as `assistant: { url }` when the app has one, and, for a caller with the `admin` role, the [runtime updates](/reference/versioning/#runtime-updates) endpoint as `runtime: { url }` when the app has one. `conditional` lists the operations allowed only for some records (a row filter or a record-level rule decides). A view's sidebar group ([`nav.recent`](/reference/sidebar/#recent-records)) is dropped when it uses a field they cannot read. The ETag hashes all of it, so it differs per user and per roles. The OpenAPI document is generated the same way: record and body schemas have only the readable and writable fields, and methods the caller may not use are left out.

## Sensitive fields and audit

A field declared [`.sensitive()`](/reference/data-config/#sensitive-fields) is in `/meta` (marked `sensitive: true`), in record `permissions.fields` and in create and update bodies, but in no list, get, `:search`, `:seek`, write or batch response, and `filter`, `order_by`, `fields` and the aggregates refuse it like an unknown field. `POST /{resource}/{key}:reveal` with `{ "field": "<name>" }` returns one record's value. It needs read access to the record and the field: another tenant's record, a row outside the caller's row filter or a key that does not exist is a `404`, a field the caller cannot read or that is not sensitive a `400`.

Before answering, the server publishes an audit event to `options.audit`, and when publishing fails the reveal fails (`500`), so no value leaves without its event. The event never holds the value:

```ts
type AuditEvent = {
  type: 'field.revealed'
  at: string                                  // ISO 8601
  actor: { id: string | number; roles: string[] }
  tenant?: string | number                    // the caller's organization, for tenant-scoped resources
  resource: string
  recordKey: string                           // as in the record's URL
  field: string
  origin: { userAgent?: string; forwardedFor?: string } // from the request headers
}
```

With [organizations](/reference/auth/#organizations), someone with a global role switching into an organization they are not a member of publishes `{ type: 'organization.entered', at, actor, organization, origin }` first, where `actor.roles` are their global roles; a failed publish refuses the switch. `AuditEvent` is the union of the two.

### Audit events

`options.audit` is an `AuditQueue`, `{ publish(event): Promise<void> }`, set in `protobase.config.ts` (`options: { roles, audit }`). The default, `consoleAuditQueue()`, prints each event to the console as one `[audit] {...}` JSON line and keeps nothing; a queue that stores or forwards events replaces it there.

## Filters

`filter` and `order_by` are AIP-160 and AIP-132 text, checked against the model (filterable and sortable fields only). Functions: `in(field, v, ...)`, `search("text")` and bare words (every word, ignoring case, anywhere inside one of the resource's search fields, so `port` finds "Portfolio"; `%`, `_` and `\` are literal; a [`digitsEnd`](/reference/data-config/#resource) field matches only the end of its digits), `similar(field, "text")`, `regex(field, "pattern")`, `isNull(field)`, `now()` with offsets such as `now() - 7d`. A filter is capped at 10,000 characters in a query string and 200,000 in a `:search` body.

## Writes

Create, update and delete share one pipeline (`write-pipeline.ts`):

1. the caller is authenticated and, for tenant-scoped resources, has a tenant (`403` otherwise);
2. unknown fields, read-only fields and the tenant column in the body are refused, each value is validated by its field's zod schema, then the resource's `.validate()` rules run (`400` with `errors: [{ field, code, message }]`);
3. one transaction with `SET LOCAL statement_timeout`; the row is locked with `FOR UPDATE`; another tenant's key, or a soft-deleted row, is a `404`;
4. the access rule runs, then `If-Match` is compared with the ETag (`428` when missing on PATCH, `412` when stale);
5. the write, then `writeHooks` inside the same transaction (a hook that throws rolls the write back). Audit logging and the admin store plug in here.

**ETag**: the `version` or `updated_at` column when the resource has a read-only one (bumped on every update, so no trigger is needed; the ETag keeps the column's full microsecond text), otherwise a hash of the exposed fields. It is computed from the row itself, so lists need no extra query.

**`etag` property**: every record in a get, list, `:search`, create or update response carries its current version as `etag` (the value of the `ETag` header, [AIP-154](https://google.aip.dev/154)), so a grid row can be updated or deleted without a get. It survives `fields` selection. A resource cannot have a field named `etag` (startup error); a body containing `etag` is a `400` that points at `If-Match`.

**If-Match** is required on PATCH (`428` without it). On DELETE it is optional: without it the current version is deleted. When sent it must match, otherwise `412`; `*` matches whatever the current version is (RFC 9110).

**Prefer**: create and update return the record by default; `Prefer: return=minimal` returns no body (`201`/`204`). Delete returns `204`, or the record with `Prefer: return=representation`.

The rules behind these steps are described under [Access](#access).

## Batch writes

`POST /api/v1:batchWrite` takes `{ ops: [...] }` (`{ operations: [...] }` is accepted too), at most 500, run in order inside ONE transaction, so check constraints and triggers see one consistent state. Each operation goes through the same write pipeline as a single write (validation, access with row filters and record-level rules, tenant, ETags, hooks), access is checked per operation, and the operations may span resources.

| `op` | fields |
| --- | --- |
| `create` | `resource`, `data`, `ref?` |
| `update` | `resource`, `key`, `etag` (required, `*` allowed), `data` |
| `delete` | `resource`, `key`, `etag?` |
| `reorder` | `resource`, `field`, `keys` (in final order), `etags` (per key text) |

- **Keys** are the URL text (`a,b` when composite), a number, a list of parts, or a reference.
- **`$ref`**: `ref: 'invoice'` on a create names the record; later operations use `{ "$ref": "invoice" }` as a key, a key part, or a value in `data` (it stands for that record's key, or with `{ "$ref": "invoice", "field": "number" }` a readable field's value). A ref must come after its create.
- **`reorder`** sets `field` to 1, 2, 3, ... in the order of `keys`, and writes only the records whose value changes, each as an ordinary update (so each needs its `etags` entry, and hooks see each). To work with a non-deferrable unique index such as `(invoice_id, position)`, the changing records are first moved out of the range in use, in the same transaction and without touching their ETags: above the highest value of the column, or, when a check constraint refuses that (checked with a savepoint), below the lowest one. Then they get their final values, which collide with nothing. The field must be an integer the caller may write; the keys must all exist and be visible to the caller.
- **Result**: `{ results: [...] }`, one entry per operation in order: `create` and `update` give `record` and `etag`, `delete` gives `deleted: true`, `reorder` gives `records` (every key in order, with its etag).
- **Failure**: nothing is written. The problem is the failing operation's own (`400`, `403`, `404`, `409`, `412`, `428`, ...) with `operation` (its index), `op` and `resource` added. A stale ETag anywhere is a `412` for the whole batch.

## Authentication

Real login is [Better Auth](/reference/auth/). Lower level:

`authenticate(request)` returns `{ user: { id, roles }, tenant? }` or throws `unauthorized(...)` (a `401` problem). Shipped: `jwtAuthenticator({ jwksUrl | keys, issuer?, audience?, rolesClaim?, tenantClaim?, tenant? })`, which verifies a bearer token with `jose` (`sub` is the user id; `tenant` fixes the tenant instead of reading a claim), and `betterAuthAuthenticator` on top of it ([Login with Better Auth](/reference/auth/)). No code path treats a request as a user without verifying a credential.

## Safety

- Every request runs in a transaction with `SET LOCAL statement_timeout` (`statementTimeoutMs`, default 15 s); a timeout is `504`. List, search, get, histogram, series and seek transactions are read-only.
- **Scan guard**: before a list shape runs for the first time, the server runs `EXPLAIN` on the filtered query and on the query layer's page query (`buildListQuery`) and caches the verdict by shape (resource, filter without its values, sort). A sequential scan of a table above `seqScanRows` (default 10,000) is a `400` `expensive-query` problem with a `create index` suggestion; `scanGuard: { mode: 'warn' }` returns the list with an `X-Protobase-Warning` header instead, `'off'` disables it. The verdict is planned with the first request's values and kept for the process lifetime.

## Errors

Every error is `application/problem+json` (RFC 9457) with `type` (`urn:protobase:problem:<slug>`), `title`, `status`, `detail`, `instance`. Filter and `order_by` errors add `parameter` and `errors: [{ code, message, hint, span: { start, end } }]`; invalid parameters add `errors: [{ parameter, message }]`. Database constraint failures map to `409` or `400` without the raw message; anything unexpected is a `500` with a fixed detail, reported to `options.onUnhandledError`.

| Status | Slugs |
| --- | --- |
| 400 | `invalid-filter`, `invalid-order-by`, `invalid-parameter`, `invalid-key`, `invalid-record`, `malformed-json`, `expensive-query`, query-layer codes |
| 401 | `unauthenticated` |
| 403 | `access-denied`, `tenant-required` |
| 404 | `not-found` |
| 409 | `conflict` |
| 412 / 428 | `precondition-failed` / `precondition-required` |
| 504 | `statement-timeout` |
