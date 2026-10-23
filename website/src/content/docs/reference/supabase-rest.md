---
title: Supabase client API
description: The PostgREST-compatible /api/sb/rest/v1 that supabase-js's from() and rpc() call, under the tables' RLS policies.
---

An app with API keys also serves `/api/sb/rest/v1`, the API that supabase-js's `from()` and `rpc()` call. An app moved from Supabase keeps its data calls: point the client at the app's `/api/sb` and give it the publishable key.

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://my-app.example.com/api/sb', 'sb_publishable_...')
const { data, error } = await supabase.from('todos').select('id, title').eq('done', false).order('id')
```

## Keys and roles

The keys are `options.apiKeys` of `createAdmin`, `{ publishable_key, secret_key }`, or else `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY`. Without either, or with `apiKeys: false`, the app serves no `/api/sb/rest/v1`. Each request sends a key in the `apikey` header, and runs in one transaction as:

| The request sends | It runs as |
| --- | --- |
| the publishable key | `anon` |
| either key and a signed-in user's token | `authenticated` |
| the secret key | the app's own role, which owns the tables |

The transaction sets the role with `SET LOCAL ROLE` and the token's claims in `request.jwt.claims` and `request.jwt.claim.sub`, so Supabase's `auth.uid()`, `auth.role()` and `auth.jwt()` work, and the tables' RLS policies decide what the request may read and write. The `role` claim is the database role, as on Supabase. The database needs the `anon` and `authenticated` roles, and the app's role must be allowed to `SET ROLE` to them.

`/api/sb/rest/v1` serves the tables the app declares as resources, in the `public` schema, under their table names. Any other table is `404`.

## What it understands

- Filters: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `match`, `imatch`, `in`, `is`, `isdistinct`, `fts`, `plfts`, `phfts`, `wfts` with a language, `cs`, `cd`, `ov`, `sl`, `sr`, `nxr`, `nxl`, `adj`, `any` and `all` modifiers, `not.`, and `or`, `and`, `not.or` and `not.and` trees, on columns and JSON paths (`meta->>kind`).
- `select` with columns, aliases (`key:id`), casts (`priority::text`) and JSON paths.
- Embedded rows of related tables, through their foreign keys: `select('*, author:profiles(name), comments(*)')`. A many-to-one or one-to-one embed is an object or `null`, a one-to-many one an array. A hint picks the foreign key when several relate the tables, by its name or column (`profiles!sender_id(name)`), and `!inner` keeps only the rows with a related row. Filters, `order`, `limit` and `offset` take the embed's name or alias as a prefix (`comments.likes=gte.2`, `comments.order=id.desc`), as supabase-js's `referencedTable` option sends them. The embedded tables' RLS policies apply too. Only tables `/api/sb/rest/v1` serves are embedded.
- `order`, `limit`, `offset` and the `Range` header. A read returns at most 1000 rows, Supabase's default.
- `Prefer: count=exact|planned|estimated`, with the count in `Content-Range` and `206` for part of the rows.
- `Prefer: return=minimal|representation`, `resolution=merge-duplicates|ignore-duplicates`, `missing=default`, and `on_conflict` and `columns`.
- `.single()` and `.maybeSingle()`, through `Accept: application/vnd.pgrst.object+json`.
- `rpc/<function>` by POST and by GET, which runs read-only. A function returning rows takes `select`, filters, `order`, a range and a count.

Not yet:

- <gap>`/api/sb/rest/v1` does not support many-to-many embeds through a junction table yet.</gap>
- <gap>`/api/sb/rest/v1` does not support spreads (`...profiles(name)`) yet.</gap>
- <gap>`/api/sb/rest/v1` does not support computed relationships yet.</gap>
- <gap>`/api/sb/rest/v1` does not support embeds in a function's rows yet.</gap>
- <gap>`/api/sb/rest/v1` does not support ordering by an embedded column yet.</gap>
- <gap>`/api/sb/rest/v1` does not support CSV yet.</gap>
- <gap>`/api/sb/rest/v1` does not support schemas other than `public` yet.</gap>
- <gap>`/api/sb/rest/v1` does not support aggregates yet.</gap>
- <gap>`/api/sb/rest/v1` does not support `tx=rollback` yet.</gap>

## Scan guard

As on the [REST API](/reference/api/#safety), a filter or a sort reads only columns an index serves: a btree index for comparisons, `in`, `is` and sorts, a pg_trgm index for patterns and regular expressions, a GIN index for text search and `cs`, `cd` and `ov` (or GiST), and a GiST index for the range operators. A JSON path needs an index on that expression. An embed's filters and order are judged on the embedded table, and so are the columns it joins on, so a one-to-many embed needs an index on the foreign key's columns. Any other read is `400` with code `expensive-query` and the statement that adds the index as its `hint`. Functions are not judged.

## Encrypted fields

The column of an [encrypted field](/reference/data-config/#encrypted-fields) holds ciphertext, which this API can neither write nor compare. A read returns it as stored. Writing the column, an `on_conflict` on it, a filter, sort or embed join on it, and, on a table with encrypted fields, a write that changes a row's key or tenant are `400` with code `encrypted-column`, writing nothing, whichever resource over the table declares the field. A view this API serves cannot be checked, so it must not show an encrypted column. Write such fields and reveal them through the [REST API](/reference/api/).

## Errors

Errors come back as PostgREST sends them, `{ code, details, hint, message }`. A database error keeps its Postgres code, message, detail and hint, with PostgREST's status: an RLS refusal (`42501`) is `401` for `anon` and `403` for others, a duplicate (`23505`) `409`, a function that writes called by GET (`25006`) `405`. `.single()` on no or several rows is `406` `PGRST116`, an unknown table `404` `PGRST205`, an unknown function `404` `PGRST202`, an embed without a relationship `400` `PGRST200` and one with several `300` `PGRST201`, and a missing or wrong key or token `401` `PGRST301`.
