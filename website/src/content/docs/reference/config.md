---
title: protobase.config.ts
description: The project's config as one object of data, the files where Protobase finds the project's code, the defaults, the JSON form and every key.
---

`protobase.config.ts`, in the project's root, describes the whole app as one object of data: its address and secret, sign-in, the jobs, the file providers and the API's settings. It default-exports `defineConfig(...)` from `@protobase/config`, which types every key and returns its argument as it is. Every key is optional; Protobase has a default for each.

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

The config names things; it never holds or imports their code. Protobase finds the code by its path, so the job above runs `jobs/send-invoice.ts` and the write hook is `hooks/queue-sent-invoice.ts`. A project without a config file is a config of defaults.

## Where the code is

Each file below is loaded only when the app needs it, never while the config is read.

| File | What it holds | Used for |
| --- | --- | --- |
| `config/index.ts`, `config/<dir>/ui.ts` | the resources, views and pages, as exports | [Data config](/reference/data-config/) |
| `config/roles.ts` | the `roles` export, made with `defineRoles` | [Access](/reference/access/) |
| `functions/<name>.ts` | an API function, as its default export | [API functions](/guides/api-functions/) |
| `jobs/<name>.ts` | what the job `<name>` of `jobs` does, as its default export (`JobRun`) | [Jobs](/reference/jobs/) |
| `hooks/<name>.ts` | a write hook named in `writeHooks`, as its default export | [Jobs](/reference/jobs/#enqueueing) |
| `hooks/error.ts` | called with every error the API answers `500` for, and the request (`onUnhandledError`) | [REST API](/reference/api/#errors) |
| `auth/hooks.ts` | sign-in's hooks, as named exports: `generateUserId`, `onUserCreated`, the organization hooks | [Login](/reference/auth/#hooks) |
| `auth/mailer.ts` | a mailer of the app's own for sign-in mail, as its default export | [Email](/reference/email/) |
| `auth/authenticate.ts` | an `Authenticator` of the app's own, such as `jwtAuthenticator(...)`, in place of `authenticate` | [Tokens and roles](/reference/auth/#tokens-and-roles) |
| `assistant/tools.ts` | the assistant's own tools, an array of `defineTool(...)` | [Assistant](/reference/assistant/) |
| `audit/queue.ts` | the `AuditQueue` reveals of sensitive fields publish to | [REST API](/reference/api/#sensitive-fields-and-audit) |
| `files/<name>.ts` | the file provider `<name>`, declared `{ kind: 'custom' }` in `files.providers` | [Files](/reference/files/) |
| `webhooks/owner-roles.ts` | the roles a webhook subscription's owner holds, when the app signs people in another way | [Webhooks](/reference/webhooks/) |
| `notifications/store.ts`, `notifications/history-store.ts`, `notifications/senders.ts` | a device store, a history store and push senders in place of the built-in ones | [Notifications](/reference/notifications/) |
| `emails/` | the templates of sign-in's mail | [Email](/reference/email/#templates) |

Hooks of the project's own get the app's database, `{ db }` (Kysely, as jobs get it), as their last argument. A job named in the config without its `jobs/<name>.ts`, or a write hook without its `hooks/<name>.ts`, stops the app at start with an error that names the file.

## Defaults

| Key | Default |
| --- | --- |
| `url` | `PROTOBASE_URL`; in `protobase dev`, the dev server's own address |
| `secret` | `PROTOBASE_SECRET` |
| `name` | `Protobase`; `PROTOBASE_APP_NAME` overrides it |
| `auth` | on, with its own defaults; `false` turns it off, as does an `authenticate.jwksUrl` that trusts an auth server elsewhere |
| `auth.trustedOrigins` | `PROTOBASE_TRUSTED_ORIGINS`, comma separated |
| `timezone` | `UTC` |
| `apiPath` | `/api/v1` |

The app's database is `DATABASE_URL`'s, with the pool size of `PROTOBASE_DB_CONNECTIONS`. With sign-in on, `protobase dev`, `serve` and the commands that sign people in stop with a clear message when the URL or the secret is missing.

## A config, or a function

`defineConfig` takes a config, or a function, plain or async, that returns one. The function gets:

| | |
| --- | --- |
| `command` | `dev`, `build`, `serve` (also `protobase worker` and the serve runtime's `migrate` and `create-admin`), or `tool`, any other command over the project, such as `migration`, `users` or `encryption` |
| `env` | `process.env`, with the project's `.env` loaded |
| `root` | the project's folder |

```ts
export default defineConfig(({ command, env }) => ({
  auth: { trustedOrigins: env.TUNNEL_URL ? [env.TUNNEL_URL] : undefined },
  errorReporting: command === 'dev' ? false : undefined,
}))
```

A config may branch on them, read files of its own with Node's `fs`, and import values from other files, such as a list of map layers, as any module can. Secrets are values like any other, read from the environment. `protobase serve` reads a bundle's config again where it runs, with that environment, so a bundle built once serves with each host's own variables.

## Reading it

Every command reads the config, in a few milliseconds: reading it runs the config's file and what that file imports, and none of the files above. A config may not load part of itself later: an `import()` in `protobase.config.ts` stops every command with an error that names it. Code belongs in the files above.

## The same config as JSON

`protobase.config.json` holds the same object as JSON. A value read from the environment is written `{ "$env": "NAME" }`, with `"default"` for when the variable is unset or empty, and `"split": ","` for a list of its non-empty parts:

```json
{
  "url": { "$env": "PROTOBASE_URL", "default": "http://localhost:5173" },
  "timezone": "Europe/Amsterdam",
  "auth": { "roles": ["admin", "sales"], "trustedOrigins": { "$env": "TUNNEL_URLS", "split": "," } },
  "jobs": { "send-invoice": { "arguments": { "invoiceId": "bigint" }, "maxAttempts": 5 } },
  "writeHooks": ["queue-sent-invoice"]
}
```

A TypeScript config may use `$env` values too. A project has one config file: one with both `protobase.config.ts` and `protobase.config.json` stops every command with an error that names both.

JSON cannot branch on the command or compute a value; a config that needs to is written in TypeScript. There is no JSON Schema for the file yet, so a JSON config is checked when the app starts rather than in the editor.

## Keys

| Key | What | See |
| --- | --- | --- |
| `name`, `url`, `secret` | the app's name, public URL and secret, which sign-in, mail and signed links use | [Login](/reference/auth/#configuration) |
| `locale`, `timezone` | the admin app's language for every user, and the time zone of the jobs' schedules | [Languages](/reference/languages/), [Jobs](/reference/jobs/#recurring-jobs) |
| `themeColor`, `backgroundColor` | the installed app's colours | [App identity](/reference/app-identity/) |
| `auth` | sign-in: roles, organizations, sign-up, providers, passkeys, MCP clients; `false` turns it off | [Login](/reference/auth/#configuration) |
| `authenticate` | how the API verifies tokens: `{ tenant }`, `{ jwksUrl, issuer }` for an auth server elsewhere, or `apps` whose tokens it admits; default the tokens of `auth` | [Tokens and roles](/reference/auth/#tokens-and-roles) |
| `jobs` | the jobs by name: `description`, `arguments`, `schedule` and the run options | [Jobs](/reference/jobs/) |
| `writeHooks` | the write hooks by name, run in this order in each write's transaction | [Jobs](/reference/jobs/#enqueueing) |
| `files` | providers by name (`{ kind: 'local', dir }`, `{ kind: 's3', bucket }` or `{ kind: 'custom' }`), `retention`, `trustedHosts` and `images: 'sharp'` | [Files](/reference/files/) |
| `events`, `history` | where changes are captured, and how long history is kept | [Events](/reference/events/), [History](/reference/history/) |
| `webhooks` | webhook subscriptions made in the app; `{}` turns them on | [Webhooks](/reference/webhooks/) |
| `notifications` | each user's devices and inbox; `{}` turns them on | [Notifications](/reference/notifications/) |
| `mobile` | the iOS and Android build | [Mobile app](/guides/mobile-app/) |
| `apiPath`, `apiKeys`, `cors`, `defaultAccess`, `rowPermissions`, `statementTimeoutMs`, `scanGuard`, `errorReporting` | the REST API's settings | [REST API](/reference/api/) |
| `assistant` | the assistant's model and limits; `false` turns it off | [Assistant](/reference/assistant/) |
| `mcpEndpoint` | the MCP endpoint's tools, or `false` | [MCP](/reference/mcp/) |
| `maps`, `plugins` | the maps' layers, and the admin app's plugins | [UI config](/reference/ui-config/), [Plugins](/reference/plugins/) |
| `remoteResources`, `runtimeUpdates` | other Protobase APIs whose resources the app draws, and the runtime's update endpoint | [Remote resources](/reference/remote-resources/), [Versioning](/reference/versioning/) |

## Extensions

`protobase dev --extend <dir>` and `protobase build --extend <dir>` merge an extension's folder into the app, before the project. The extension's folder has a config and code of its own, found by the same paths in that folder. A config cannot extend another itself.

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
