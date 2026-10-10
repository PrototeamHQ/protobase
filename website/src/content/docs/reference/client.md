---
title: Client and live UI
description: The typed fetch client, the TanStack Query hooks and the admin app that runs on them.
---

`@protobase/client` is a typed fetch client for `/api/v1`; `@protobase/ui` wraps it in TanStack Query hooks (`src/data`) and runs the admin on both (`src/app`). Everything runs in the browser (or anywhere with `fetch`) and imports only `@protobase/schema` and `@protobase/layout`'s types.

```ts
import { createClient } from '@protobase/client'
import { where } from '@protobase/schema'

const api = createClient({ baseUrl: '/api/v1', onMetaVersion: (version) => { /* refetch meta when it changes */ } })

const page = await api.list(orders, { filter: where.eq('status', 'draft'), orderBy: 'createdAt desc', pageSize: 50, fields: ['id', 'number'] })
const { record, etag } = await api.get(orders, id)
await api.update(orders, id, { status: 'shipped' }, etag) // 412 rejects with PreconditionFailedError
```

Pass a resource builder to get its record type (`InferRecord`), or a name for loose records. Filters are AIP-160 text or `where` results (printed with `printFilter`). Errors are `ApiError` (`status`, `slug`, `errors`, `filterErrors` with spans). Also: `search`, `create`, `remove`, `facets`, `series`, `histogram`, `seek`, `reveal(resource, key, field)` (a [sensitive field](/reference/data-config/#sensitive-fields)'s value), `meta(etag?)`.

## The admin app

`<App baseUrl="/api/v1" />` renders the shell from `/api/meta` (beside the API, so `createClient` derives it from `baseUrl`) and routes `/:page` ([composed pages](/reference/layouts/)), `/:resource` (list) and `/:resource/:key` (record); it opens on the first page, or the first resource. Its own pages sit under `/-/`, which no page or resource name takes: `/-/account` (the user's passkeys and two-factor authentication) and `/-/sign-in-policy` (admins: the policy, and the log of staff sign-ins). Before the shell, it signs in with the methods the server offers and asks for what the [sign-in policy](/reference/auth/#sign-in-policy) requires; `?staff-sign-in` opens the [staff sign-in](/reference/auth/#staff-sign-in) page instead, and a staff session gets a banner above the shell. `createAuthSession` from `@protobase/client` is that session (`signIn`, `signInWithCode`, `signInWithPasskey`, `verifyTwoFactor`, `account`, `signInPolicy`, `staff`). `ui` takes the project's [custom components and action handlers](/reference/custom-components/). The list state lives in the URL: `?filter=` (AIP-160), `?order_by=`, `?layout=panel`. Views come from `examples/*/config/*/ui.ts`. The sidebar's recent-record groups and the user menu are configured there too: see [Sidebar](/reference/sidebar/) and [User menu](/reference/user-menu/).

## Global search

The search box in the top bar looks in every resource the user can read that has search fields (`.search(...)` in its [data config](/reference/data-config/#resource)) and a view in the sidebar or the user menu. Its placeholder names them, such as "Search organizations, services and more"; without any such resource there is no box.

From two characters on, it asks each of those resources' list API for `search("<text>")` (every word, even part of one, in one of the search fields; the end of a [`digitsEnd`](/reference/data-config/#resource) field) with the user's token, five records each, so row filters and hidden fields apply exactly as on the lists and it never offers a record the user could not open. The results are grouped by resource, two lines each: a bold title, the view's [`searchResult`](/reference/ui-config/#names-and-columns) title fields joined by spaces (default: the record's title), and a subtitle, the view's `searchResult` subtitle (default: the first search field not in the title). When the text matched a search field that neither line shows, such as a phone number, that field is the subtitle instead.

Each result is a link: a click or Enter opens the record and closes the list, and Cmd or Ctrl click, a middle click or the browser's menu open it in a new tab. The text stays, so focusing the box again shows the same results without asking the server; only changed text searches again. While the box has text, a clear button replaces the ⌘K hint. ⌘K (Ctrl+K) focuses the box, or opens it on a phone; the arrow keys move through the results, and Escape clears the box, then leaves it. A resource whose search fails says so in its group.

## Live stories

`bun run db:up && bun run --cwd examples/erp serve`, then `bun run storybook`. Storybook proxies `/api` to `PROTOBASE_API` (default `http://localhost:8787`); pick another API in the toolbar. Without a server the stories say so. `bun run screenshots:live` writes `screenshots/live/`.
