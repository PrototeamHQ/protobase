---
title: Remote resources
description: Resources another Protobase API serves, drawn in an app with its own list pages, record pages, sidebar and links, at their own addresses.
---

An app can draw resources that another Protobase API serves, as if they were its own: the same list page, record page, create form, breadcrumbs, sidebar entry with its recent records, global search, links and actions, at the same `/<resource>/<key>` addresses. The other API is a **source**. Its config, its data, its access rules and its views stay where they are; the app lists which of its resources it draws, and the signed-in person works with them under the source's rules.

A shop's admin app can show the tickets of the company's service desk this way, next to its orders, and a hosting platform can show each app the tasks it keeps for that app. [Showing another app's records](/guides/remote-resources/) builds the first, step by step.

## How it works

Nothing new is invented for a remote resource. Every page of the admin app is drawn from two things: the resource's model and view from `/api/meta`, and its records from `/api/v1`. A source is another place to get both.

1. **The app names its sources.** Its `/api/meta` lists each source the caller may use: where its API is, what it is called, and the resources the app draws from it.
2. **The browser reads each source's `/meta` itself,** with the signed-in person's own token, and keeps only the resources the app draws. The source answers as it answers anyone: with the resources the person may see there, each as they may see it, and the view for their role.
3. **The app merges them into its own.** A remote resource's model, view and permissions sit next to the app's own resources, so every part of the app that reads a resource reads it the same way: the sidebar places it by its view's `nav`, the breadcrumbs name it by its view's names and title, the list page shows its columns, filters and displays.
4. **Every call about a remote resource goes to its source.** The app's client sends each call to the API that serves the resource, with the same token: lists, records, writes, aggregates, uploads. The app's server is not in between and stores nothing of it.

So the source decides what a person sees and may do, exactly as in its own admin app, and the app decides where it shows it. The app does not wait for its sources: its own resources show at once, and a source's resources join when its `/meta` has loaded.

```
 browser, on the app's origin                     the app's API            the source's API
 ─────────────────────────────                    ─────────────            ────────────────
 GET  /api/meta                      ───────────▶ resources, views,
                                     ◀─────────── sources: [{ url, label, resources }]
 GET  <source>/api/meta  (token)     ─────────────────────────────────────▶ the person's resources
                                     ◀───────────────────────────────────── and views there
 GET  <source>/api/v1/tickets?...    ─────────────────────────────────────▶ rows, by its rules
 PATCH <source>/api/v1/tickets/12    ─────────────────────────────────────▶ the write, by its rules
```

## Declaring a source

A source is declared on the app's server, in `remoteResources` of its config, or by the platform that runs the app in `PROTOBASE_SOURCES`, without the app's own code:

```ts
// protobase.config.ts
export default defineConfig({
  remoteResources: [{ url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets', 'ticket_notes'] }],
})
```

```sh
PROTOBASE_SOURCES='[{"url":"https://desk.example.com/api/v1","label":"Service desk","resources":["tickets","ticket_notes"]}]'
```

| Source | |
| --- | --- |
| `url` | The source's resources API, the `/api/v1` of another Protobase app: a path, with nothing after it. Its `/meta` is beside it, at `/api/meta`. |
| `label` | The source's name as people read it, when it cannot be reached. |
| `resources` | The resources the app draws from it, by their names there. Its other resources stay out of the app. |
| `roles` | Optional: only callers holding one of these roles are told about the source. Without, everyone is. |

The sources of `remoteResources` come first, then those of `PROTOBASE_SOURCES`; `remoteResources: false` turns both off.

**Checks at startup.** The server refuses to start, naming the source, when a source cannot work: a `url` that is no http(s) URL or names no path, a missing `label` or `resources`, a key a source does not take (such as `resource` for `resources`), the same `url` listed twice, or one resource drawn from two sources. It refuses to start too when a source draws a resource under a name the app already has, for one of its own resources or a [composed page](/reference/layouts/): the address `/<name>` would mean two things. Rename one of them, or leave it out of the source's resources.

## Who sees what

Two places decide, each about what it knows:

- **The app** decides who is told about a source, with its `roles`. A caller without one of them gets no `sources` in `/api/meta`, and their browser never calls that source.
- **The source** decides everything else, as for its own users. Its `/meta` names only the resources the person may see there, each without the fields they may not read and with the view for their role; its API applies its [access rules](/reference/access/), row filters and record checks to every call. A resource the app draws but the person may not see there is not in their app.

A source's view can be written for the people of another app: views are picked [per role](/reference/ui-config/#actions-and-views-per-role) with `.forRoles([...])`, and the role the source gives the app's users (see below) can have a view of its own, with its own `nav` group, columns and layout.

## Signing in at the source

The browser sends the source the token the app issued to the signed-in person, as it sends it to the app's own API (`Authorization: Bearer`). The source accepts it or not: there is no second sign-in, and the app never sees a password or key of the source.

A Protobase API accepts the tokens of another Protobase app when it lists that app in `authenticate.apps`:

```ts
// the source's protobase.config.ts
export default defineConfig({
  authenticate: { apps: [{ issuer: 'https://shop.example.com', roles: { admin: 'shop' } }] },
})
```

| Trusted app | |
| --- | --- |
| `issuer` | The other app's `url`, its `PROTOBASE_URL`, with or without a trailing slash: the issuer and audience of its tokens. Its keys are read from `<issuer>/api/auth/jwks`. |
| `roles` | Its global roles as they are here: `{ admin: 'shop' }` makes its admins `shop` here. A role it does not list is dropped, and a user left with none is refused with `403`. A role someone holds in one of its [organizations](/reference/auth/#organizations) is never mapped, since that organization's owners hand it out; with organizations there, only a global role counts. |
| `tenant` | The tenant its users work in here, for resources with a [tenant](/reference/data-config/#resource). Nothing in its tokens names a tenant here. |
| `keys` | Its key set, instead of reading it from its `/api/auth/jwks`: for tests, or keys at hand. |

- A token whose issuer is a trusted app's is verified against that app's keys, with that issuer as issuer and audience; every other token goes to the app's own check. The key set is kept for 10 minutes and read again for an unknown key, as jose's remote key sets do.
- The user's id here is `<sub>@<that app's host>`, such as `x81kd2@shop.example.com`, so it never equals an id of this app's own users: an [owner field](/reference/access/) or an audit entry tells them apart.
- Give the other app's users roles of their own (`shop`, not `admin`) and open to those roles exactly what you share. A role that is only in `apps` needs no place in `auth.roles`, which are the roles of this app's own users; with [`defineRoles`](/reference/access/), define what it may do like any role.
- An app without `defineRoles` [allows](/reference/access/#defaults) every operation without a rule to everyone signed in, the other app's users included. Give the resources you do not share an access rule that leaves their role out, or define roles.
- A trusted app cannot be this app itself.

A source that is not a Protobase app accepts the app's tokens its own way: they are EdDSA JWTs whose issuer and audience are the app's `url` (`PROTOBASE_URL`), whose keys are at `<that URL>/api/auth/jwks`, which carry the user's id in `sub`, their active role in `role` and live for 15 minutes (see [Tokens and roles](/reference/auth/#tokens-and-roles)).

**What it trusts.** A source sees the person's token, which the app's own API also accepts until it expires, within 15 minutes. List as a source only an API you trust as much as a [plugin](/reference/plugins/), whose code runs in the app with the same rights.

## CORS

The browser calls the source from the app's origin, so the source answers [CORS](/reference/api/#cors) for it: it lists the app's origin in `cors` or `PROTOBASE_CORS_ORIGINS`:

```ts
// the source's protobase.config.ts
export default defineConfig({ cors: ['https://shop.example.com'] })
```

A Protobase API then answers preflights for the bearer token and the `If-Match` and `If-None-Match` headers, and exposes `ETag`, `Location` and `X-Meta-Version`, which the app uses. Without it the browser refuses every answer of the source, and the app shows its resources as unavailable.

## What the app draws

Everything the app draws for a resource of its own, for a remote resource too:

| Part | For a remote resource |
| --- | --- |
| Sidebar | An entry where the source's view places it (`nav.group`, `nav.order`), with its [recent records](/reference/sidebar/#recent-records), read from the source. `nav.hidden` keeps it out. |
| List page | Its columns, sort, filters, search, displays and chart, at `/<resource>`, with every list state in the address. |
| Record page | Its sections, related records, sidebar, actions and custom sections, at `/<resource>/<key>`, saved back to the source with its ETag. |
| Create form | At `/<resource>/new`, when the person may create there. |
| Breadcrumbs | The sidebar group, the list and the record's title, each a link. |
| Global search | Its search fields, when it has them and a sidebar entry. |
| Links and actions | Links to its own records and lists; `a.update` and `a.remove` write to the source; handlers run with the source's client (see [Custom components](#custom-components)). |
| Files | Uploaded to the source, and downloaded from it. |

What leads out of the source is left out, since the app has no such page or has another resource by that name:

- a relation to a resource the app does not draw from the same source shows the key it holds;
- related records of such a resource, and related columns that go through such a relation;
- links to such a resource, and links to a page.

The source's composed pages, user menu, bottom bar, assistant and plugins are its own app's; the app draws only resources. The app's own config cannot name a remote resource either, in its user menu, bottom bar or pages, since it is not there when the server starts.

A batch write goes to the one API its writes are for. One that writes to the app's own resources and a source's, or to two sources, cannot be atomic and is refused before anything is sent.

## Custom components

A source's view can name [custom components](/reference/custom-components/) like any view: a record section with `l.custom(TicketTimeline)`, a list display, a record card or a field type. The app draws them by name from its [plugins](/reference/plugins/), as it draws its own: a component no loaded plugin provides draws its fallback in its place.

So whoever runs a source ships its components as a plugin, and the app lists the plugin with the source:

```sh
PROTOBASE_SOURCES='[{"url":"https://desk.example.com/api/v1","label":"Service desk","resources":["tickets"]}]'
PROTOBASE_PLUGINS='https://desk.example.com/plugins/desk/plugin.json'
```

```tsx
// the desk's config: the component its plugin provides
export const TicketTimeline = component('TicketTimeline', { plugin: 'desk' })
```

Inside, the component reads its record with `useLayoutRecord()`, and its data with `useList` and `useRecord`, which go to the source for a remote resource like every other call. `useMeta()` gives the app's `/meta` with the sources' resources in it, and how far each source has loaded in `sources`. `useResourceClient(resource)` gives the client of the API that serves a resource, the source's for a remote one, whose `invoke` calls that API's [functions](/guides/api-functions/); `useClient()` sends resource calls where they belong, and `invoke` to the app's own functions. An action handler gets the client of the resource's API as `client`.

## When a source cannot be reached

The rest of the app keeps working. A source's resources are in the app while its `/meta` has loaded, and say why while it has not:

- **While it loads** they are not in the sidebar yet, and their addresses show "Loading from *label*". The app waits at most 10 seconds.
- **When it cannot be read**, because it does not answer, refuses the token or answers an error, each resource the app draws from it is in the sidebar under the source's `label`, marked "Cannot reach *label*", and its addresses show the same with the reason, such as "It did not accept your sign-in", and **Try again**.
- **When it fails later**, after it answered once, the app keeps what it read and a call that fails shows its error where it was made, as for the app's own API.

Each source's `/meta` is read again when the window regains focus, with `If-None-Match`, and when one of its answers carries a new `X-Meta-Version`, as the app's own is.

## API

**`/api/meta`** names the caller's sources in `sources`: `[{ url, label, resources }]`, without `roles`; none without sources.

**Config and `@protobase/server`**

| | |
| --- | --- |
| `remoteResources` | `SourceOption[]` (`{ url, label, resources, roles? }`) or `false`. |
| `PROTOBASE_SOURCES` | A JSON list of the same, after `remoteResources`. |
| `authenticate.apps` | `TrustedApp[]` (`{ issuer, roles, tenant?, keys? }`): other apps whose tokens the API admits. |
| `withTrustedApps(own, ownIssuer, apps)` | The same around any authenticator. |
| `sourceOptions`, `checkSourceNames`, `sourcesFor` | What `createAdmin` reads, checks and names, for hosts that read sources themselves. |

**`@protobase/client`**

| | |
| --- | --- |
| `sourceMeta(meta, source)` | The part of a source's `/meta` an app draws: `{ resources, views, permissions }` of the resources `source` lists, with what leads out of the source left out. |
| `routedClient(own, sourceOf)` | One `Client` over the app's API and its sources: `sourceOf(resource)` gives a source's client, or `undefined` for the app's own. `meta` and `invoke` go to the app's own. |
| `createClient({ baseUrl })` | With an absolute `baseUrl`, each file in a record it answers has an absolute `url`, on that API's origin. |

**`@protobase/ui`**

| | |
| --- | --- |
| `useResourceClient(resource)` | The client of the API that serves `resource`. |
| `useClient()` | Below the app's `MetaGate`, the client that sends each resource's calls to its API. |
| `useMeta()` | Below the app's `MetaGate`, `data` holds the resources of its sources too, and `sources`: each source with how far it has loaded (`loading`, `ready`, `error`). |
| `ActionContext.client` | The client of the action's resource's API. |
| `App` `sources` | Ready-made clients of the sources by their `url`, for stories and tests. |
