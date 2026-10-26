---
title: Configuring Protobase
description: The project's config file, protobase.config.ts or protobase.config.json, as one object of data; defineConfig and its function form, $env values, where the project's code is found and how extensions merge.
---

Protobase reads its config from one file in the project's root: `protobase.config.ts`, or `protobase.config.json` for the same object as JSON. The file describes the whole app as one flat object of data: its address and secret, sign-in, the jobs, the file providers and the API's settings. Every key is optional; Protobase has a default for each, and a project without a config file is a config of defaults.

```ts
// protobase.config.ts
import { defineConfig } from '@protobase/config'

export default defineConfig({
  timezone: 'Europe/Amsterdam',
  auth: { roles: ['admin', 'sales'], organizations: true },
  jobs: {
    'send-invoice': { description: 'Mails an invoice to its customer.', arguments: { invoiceId: 'bigint' }, maxAttempts: 5 },
  },
  writeHooks: ['queue-sent-invoice'],
})
```

The config names things; it never holds or imports their code. Protobase finds the code by its path, so the job above runs `jobs/send-invoice.ts` and the write hook is `hooks/queue-sent-invoice.ts`.

Each key is described with its type and default in the option pages:

| Page | Keys |
| --- | --- |
| [App options](/reference/config/app/) | `name`, `url`, `secret`, `previousSecrets`, `locale`, `timezone`, `themeColor`, `backgroundColor`, `mobile` |
| [Sign-in options](/reference/config/sign-in/) | `auth`, `authenticate`, `signingKeyDays`, `signingKeyGraceDays` |
| [API options](/reference/config/api/) | `apiPath`, `apiKeys`, `cors`, `defaultAccess`, `rowPermissions`, `statementTimeoutMs`, `scanGuard`, `errorReporting`, `writeHooks`, `mcpEndpoint`, `remoteResources`, `runtimeUpdates` |
| [Admin app options](/reference/config/admin-app/) | `assistant`, `maps`, `plugins` |
| [Jobs and events options](/reference/config/jobs-and-events/) | `jobs`, `events`, `history`, `webhooks`, `notifications` |
| [Files options](/reference/config/files/) | `files` |

## Config types

`defineConfig` from `@protobase/config` types every key and returns its argument as it is, so the editor completes and checks the config without anything running. The package exports the types too: `ProtobaseConfig` is the object, and `AuthConfig` and `FilesConfig` are its `auth` and `files`.

```ts
import type { ProtobaseConfig } from '@protobase/config'

const config: ProtobaseConfig = { timezone: 'Europe/Amsterdam' }
export default config
```

## Conditional config

`defineConfig` also takes a function, which gets the command that reads the config, the environment and the project's folder, and returns a config:

```ts
export default defineConfig(({ command, env }) => ({
  auth: { trustedOrigins: env.TUNNEL_URL ? [env.TUNNEL_URL] : undefined },
  errorReporting: command === 'dev' ? false : undefined,
}))
```

| | |
| --- | --- |
| `command` | `dev`, `build`, `serve` (also `protobase worker` and the serve runtime's `migrate` and `create-admin`), or `tool`, any other command over the project, such as `migration`, `users` or `doctor` |
| `env` | `process.env`, with the project's `.env` loaded |
| `root` | the project's folder |

`protobase serve` reads a bundle's config again where it runs, with that environment, so a bundle built once serves with each host's own variables. The types are `ConfigEnv`, `ConfigCommand` and `ConfigFunction`.

## Async config

The function may be async, and return its config as a promise:

```ts
import { readFile } from 'node:fs/promises'

export default defineConfig(async ({ root }) => ({
  maps: JSON.parse(await readFile(`${root}/maps.json`, 'utf8')),
}))
```

A config may read files of its own with Node's `fs`, and import values from other files, such as a list of map layers, as any module can.

## Environment variables

Secrets are values like any other, read from the environment. Several keys fall back to a variable of their own when the config leaves them out, such as `url` to `PROTOBASE_URL`; each option names its variable. A TypeScript config reads any other variable from `env` (or `process.env`, which holds the same):

```ts
export default defineConfig(({ env }) => ({
  auth: { trustedOrigins: env.TUNNEL_URLS?.split(',') },
}))
```

A JSON config reads one with an `$env` value: `{ "$env": "NAME" }`, with `"default"` for when the variable is unset or empty, and `"split": ","` for a list of its non-empty parts, each trimmed. A value whose variable is unset and has no default is left out, as if the key were not written. A TypeScript config may write `$env` values too, but its types do not know them; `env` is the typed way.

The app's database is `DATABASE_URL`'s, with the pool size of `PROTOBASE_DB_CONNECTIONS`; neither is a key of the config.

## The same config as JSON

`protobase.config.json` holds the same object as JSON, with [`$env` values](#environment-variables) for what the environment gives:

```json
{
  "url": { "$env": "PROTOBASE_URL", "default": "http://localhost:5173" },
  "timezone": "Europe/Amsterdam",
  "auth": { "roles": ["admin", "sales"], "trustedOrigins": { "$env": "TUNNEL_URLS", "split": "," } },
  "jobs": { "send-invoice": { "arguments": { "invoiceId": "bigint" }, "maxAttempts": 5 } },
  "writeHooks": ["queue-sent-invoice"]
}
```

JSON cannot branch on the command or compute a value; a config that needs to is written in TypeScript. There is no JSON Schema for the file yet, so a JSON config is checked when the app starts rather than in the editor.

## One config per project

A project has one config file: one with both `protobase.config.ts` and `protobase.config.json` stops every command with an error that names both. A config cannot extend another itself; [extensions](#extensions) merge folders instead.

## Reading it

Every command reads the config, in a few milliseconds: reading it runs the config's file and what that file imports, and none of the project's code. A config may not load part of itself later: an `import()` in `protobase.config.ts` stops every command with an error that names it. Code belongs in the files below.

## Where the code is

Protobase loads each file below only when the app needs it, never while the config is read. Hooks of the project's own get the app's database, `{ db }` (Kysely, as jobs get it), as their last argument. A job named in the config without its `jobs/<name>.ts`, or a write hook without its `hooks/<name>.ts`, stops the app at start with an error that names the file.

The resources and roles have no key of their own:

| File | What it holds | See |
| --- | --- | --- |
| `config/index.ts`, `config/<dir>/ui.ts` | the resources, views and pages, as exports | [Data config](/reference/data-config/) |
| `config/roles.ts` | the `roles` export, made with `defineRoles` | [Access](/reference/access/) |
| `functions/<name>.ts` | an API function, as its default export | [API functions](/guides/api-functions/) |

The other files belong to an option, and are described with it:

| File | Option |
| --- | --- |
| `auth/hooks.ts`, `auth/mailer.ts`, `emails/` | [`auth`](/reference/config/sign-in/#auth) |
| `auth/authenticate.ts` | [`authenticate`](/reference/config/sign-in/#authenticate) |
| `hooks/<name>.ts` | [`writeHooks`](/reference/config/api/#writehooks) |
| `hooks/error.ts`, `audit/queue.ts` | [Code of the API](/reference/config/api/#code-of-the-api) |
| `assistant/tools.ts` | [`assistant`](/reference/config/admin-app/#assistant) |
| `jobs/<name>.ts` | [`jobs`](/reference/config/jobs-and-events/#jobs) |
| `webhooks/owner-roles.ts` | [`webhooks`](/reference/config/jobs-and-events/#webhooks) |
| `notifications/store.ts`, `notifications/history-store.ts`, `notifications/senders.ts` | [`notifications`](/reference/config/jobs-and-events/#notifications) |
| `files/<name>.ts` | [`files.providers`](/reference/config/files/#filesproviders) |

## Extensions

`protobase dev --extend <dir>` and `protobase build --extend <dir>` merge an extension's folder into the app, before the project. The extension's folder has a config and code of its own, found by the same paths in that folder.

```tsx
// protobase.ui.tsx
import { defineUi } from '@protobase/ui'
import * as tasksUi from 'some-extension/protobase.ui'

export default defineUi({ extends: [tasksUi] })
```

| What | How it merges | The same name twice |
| --- | --- | --- |
| resources, views and pages of `config/` | all kept | an error naming both folders |
| user menu | at most one among all folders | an error |
| assistant tools of `assistant/tools.ts` | the extensions' first, in order, then the app's | an error naming the tool and both folders |
| `jobs`, functions, file providers | all kept, by name | an error naming the name and both folders |
| `writeHooks` | all run, in the same order | |
| `config/roles.ts`, `auth/authenticate.ts`, `audit/queue.ts`, `hooks/error.ts`, `webhooks/owner-roles.ts`, `notifications/*.ts` | the app's own; otherwise the last extension's | |
| `auth/hooks.ts`, `auth/mailer.ts` | those of the last folder whose config sets `auth`; otherwise the app's | |
| every other key (`auth`, `authenticate`, `assistant`, ...) | the app's own; otherwise the last config that sets it | |
| UI components (exported by name or in `components`), `actions` | all kept | an error naming the name and both configs |
| UI `shell.actions`, `shell.rightPanel` | all drawn, the extended configs' first | |
| UI `shell.logo` | the app's own; otherwise the last config that sets it | |

Errors name an extension by its folder. Nothing is namespaced, so a collision is always an error, never a silent override. Names starting with `Protobase` (components) and `protobase_` (tools) belong to Protobase's own extensions, such as `ProtobaseCloudTask` and `protobase_cloud_create_proposal`; give yours other names.
