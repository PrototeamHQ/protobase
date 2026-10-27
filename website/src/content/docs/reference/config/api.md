---
title: API options
description: The config keys of the REST API, its path, keys, CORS, access defaults, query limits, error reporting, write hooks, MCP tools, remote resources and runtime updates, and the files of the API's own hooks.
---

The keys of the API, at the top level of [`protobase.config.ts`](/reference/config/). The API itself is described in [REST API](/reference/api/).

## apiPath

- **Type:** `string`
- **Default:** `/api/v1`

The path of the REST API on the app's origin. A bundle serves only `/api/v1`: `protobase serve`, the serve runtime and `protobase worker` refuse a config with another path, so another one works in `protobase dev` and in a server of the app's own around `createAdmin`.

```ts
export default defineConfig({ apiPath: '/api/v2' })
```

## apiKeys

- **Type:** `{ publishable_key?: string; secret_key?: string } | false`
- **Default:** `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY`
- **Environment variables:** `PROTOBASE_PUBLISHABLE_KEY`, `PROTOBASE_SECRET_KEY`

The app's two keys, for clients that call it the way they call Supabase: with one, the app serves the PostgREST-compatible `/api/sb/rest/v1`, the Realtime-compatible `/api/sb/realtime/v1` and the Storage-compatible `/api/sb/storage/v1`. The publishable key is safe in a browser and makes a request anonymous or its signed-in user's; the secret key stays on servers and makes a request the app's own. A publishable key that looks like a secret one, the other way round, or both the same stop the app at start. Without either, or with `false`, the app serves none of them. See [Supabase client API](/reference/supabase-rest/).

```ts
export default defineConfig(({ env }) => ({
  apiKeys: { publishable_key: env.PUBLISHABLE_KEY, secret_key: env.SECRET_KEY },
}))
```

## cors

- **Type:** `'*' | string[]`
- **Default:** `PROTOBASE_CORS_ORIGINS`, `*` or comma separated, when set
- **Environment variable:** `PROTOBASE_CORS_ORIGINS`

The websites whose browser code may call the API (`/api/*` but `/api/auth/*`) besides the app's own origins: a list of origins, or `*` for any. A [`mobile`](/reference/config/app/#mobile) section adds the app's Capacitor origins. With none, the API sends no CORS headers for other websites. See [CORS](/reference/api/#cors).

```ts
export default defineConfig({ cors: ['https://shop.example.com'] })
```

## defaultAccess

- **Type:** `'allow' | 'deny'`
- **Default:** without roles, `allow`; with roles, the capability check

What an operation without an access rule does, over the capability check of the roles in `config/roles.ts`. `allow` together with roles opens such operations to every user, and the app warns about it at start. See [Access](/reference/access/).

```ts
export default defineConfig({ defaultAccess: 'deny' })
```

## rowPermissions

- **Type:** `boolean | { except: string[] }`
- **Default:** `true`

Whether list items carry their `permissions` (update, delete), or `{ except: [...] }` for the resources that leave them out. See [Record permissions](/reference/api/#record-permissions).

```ts
export default defineConfig({ rowPermissions: { except: ['events'] } })
```

## statementTimeoutMs

- **Type:** `number`
- **Default:** `1000`

How long a query of an API request may run, in milliseconds; a query that runs longer answers `504` and names the request. A query that needs longer wants an index or a simpler filter, or belongs in a function or a job with `longQueries`. See [Safety](/reference/api/#safety).

```ts
export default defineConfig({ statementTimeoutMs: 3000 })
```

## scanGuard

- **Type:** `{ mode?: 'reject' | 'warn' | 'off' }`
- **Default:** `{ mode: 'reject' }`

What the API does with reads that filter, sort or count by a column no index serves: refuse them, let them through with a warning, or let them through. See [Safety](/reference/api/#safety).

```ts
export default defineConfig({ scanGuard: { mode: 'warn' } })
```

## errorReporting

- **Type:** `{ dsn?: string; environment?: string } | false`
- **Default:** the DSN in `PROTOBASE_SENTRY_DSN`, when set
- **Environment variable:** `PROTOBASE_SENTRY_DSN`

Where the app's errors go: the server's `500`s, stopped queries and crashes, and the admin app's errors in the browser. `dsn` is a project's DSN in Sentry or a tracker that speaks its protocol, such as Bugsink or GlitchTip; `environment` names the deployment there. `false` turns it off. A DSN without a public key or a project id stops the app at start. See [Error reporting](/reference/api/#error-reporting).

```ts
export default defineConfig(({ command }) => ({
  errorReporting: command === 'dev' ? false : { environment: 'staging' },
}))
```

## writeHooks

- **Type:** `string[]`
- **Default:** none

The write hooks by name, run in this order inside each create's, update's and delete's transaction, with that transaction. Each is the default export of `hooks/<name>.ts`, loaded on the first write; a name without its file stops the app at start with an error that names the file. A hook does database work only: while it waits on anything else, such as an HTTP call, the row stays locked, so it enqueues a job for such work. [Enqueueing](/reference/jobs/#enqueueing) shows a hook that does.

```ts
export default defineConfig({ writeHooks: ['queue-sent-invoice'] })
```

## mcpEndpoint

- **Type:** `{ sql?: boolean; writes?: boolean | { resources?: string[]; rolesWithoutApproval?: string[] } } | false`
- **Default:** the read tools only: `list_resources`, `list_records`, `count_records` and `get_record`

The MCP endpoint's tools; [`auth.mcp`](/reference/config/sign-in/#authmcp) turns the endpoint on. `sql: true` also offers admins and the `ai` role `run_read_only_query`, which reads the whole database outside the access rules. `writes: true` offers `create_record`, `update_record`, `delete_record` and `batch_write` through the REST API's rules, each approved by the person in their client; `writes.resources` limits them to the resources named, and `writes.rolesWithoutApproval` lets holders of those roles, such as a service account, write without the approval. `false` is for a host that serves its own MCP endpoint at `auth.mcp.path`, in front of this app. See [MCP](/reference/mcp/#the-tools).

```ts
export default defineConfig({ auth: { mcp: true }, mcpEndpoint: { writes: { resources: ['tasks'] } } })
```

## remoteResources

- **Type:** `{ url: string; label: string; resources: string[]; roles?: string[] }[] | false`
- **Default:** those `PROTOBASE_SOURCES` lists
- **Environment variable:** `PROTOBASE_SOURCES`, a JSON list of the same objects, added after the config's

Other Protobase APIs whose resources the admin app draws as its own. `url` is the other API's resources API, such as `https://other.example.com/api/v1`; `label` names it to people when it cannot be reached; `resources` are the ones drawn from it; with `roles`, only callers holding one of them see it. `false` turns off both the config's and the variable's. See [Remote resources](/reference/remote-resources/#declaring-a-source).

```ts
export default defineConfig({
  remoteResources: [{ url: 'https://crm.example.com/api/v1', label: 'CRM', resources: ['contacts'] }],
})
```

## runtimeUpdates

- **Type:** `{ url?: string } | false`
- **Default:** `PROTOBASE_RUNTIME_URL`, when set
- **Environment variable:** `PROTOBASE_RUNTIME_URL`

The endpoint that reports the app's runtime version and updates it, such as a hosting platform's; the top bar shows an update button to admins from what it answers. `false` turns it off. See [Runtime updates](/reference/versioning/#runtime-updates).

```ts
export default defineConfig({ runtimeUpdates: false })
```

## Code of the API

Two files of the project's own change what the API does, each its default export, with no key in the config:

- `hooks/error.ts`: called with every error the API answers `500` for, every query stopped at its statement timeout and every request that found all database connections busy, and the request it failed, so the app can report it. See [Errors](/reference/api/#errors).
- `audit/queue.ts`: the `AuditQueue` that receives an event for every reveal of a sensitive field; without it, each is printed to the console and nothing is kept. See [Sensitive fields and audit](/reference/api/#sensitive-fields-and-audit).

```ts
// hooks/error.ts
export default (error: unknown, request?: Request) => {
  console.error(request?.url, error)
}
```
