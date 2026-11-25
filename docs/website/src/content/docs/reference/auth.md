---
title: Login with Better Auth
description: Sign-in with Better Auth, with the admin store, sign-in methods and policy, sign-in providers, staff sign-in, roles, tokens and the public endpoints.
---

`@protobase/server` ships a [Better Auth](https://www.better-auth.com) setup (version 1.7): sign-in with a password, an [emailed code](#emailed-sign-in-codes) or a [passkey](#passkeys), [two-factor authentication](#two-factor-authentication), a [sign-in policy](#sign-in-policy) admins set in the app, [staff sign-in](#staff-sign-in) for the team that runs the app, [SAML single sign-on](#sign-in-with-saml), roles, and short-lived JWTs that the API verifies against Better Auth's own JWKS, and, when turned on, [organizations](#organizations) people work in one at a time. All of it is Better Auth's own plugins (`emailOTP`, `twoFactor`, `@better-auth/passkey`, `@better-auth/sso`), wired by Protobase; the SSO and MCP plugins load only when the config turns them on.

Sign-in is on by default. Its settings are the `auth` key of [`protobase.config.ts`](/reference/config/), and it takes the app's address, secret and name from `url`, `secret` and `name`:

```ts
// protobase.config.ts
import { defineConfig } from '@protobase/config'

export default defineConfig({
  auth: { roles: ['admin', 'sales'] },
  authenticate: { tenant: 1 },
})
```

`auth: false` turns sign-in off. The app serves it at `/api/auth/*` next to the API at `/api/v1`. The snippets below show the keys of `auth` they set.

## Admin store

Users, sessions and signing keys stay apart from the application's tables, in a schema of the app's own database, `auth` by default (`auth: { schema: 'accounts' }` names another), so a host that gives an application one database (and a role that cannot create databases) is enough. Sign-in, sessions, tokens and organization memberships run through the app's own query layer, on its one pool on `DATABASE_URL`, which `protobase dev` and `serve` open, so the store opens no connections beyond [`PROTOBASE_DB_CONNECTIONS`](/reference/cli/#serve), and a database restart is printed instead of stopping the app.

### Migrations

The store's tables come from steps that ship with Protobase, and are part of the project's migrations, committed in the repository like the application's own: the examples carry them as `db/migrations/*_auth.sql`, and their `db:migrate` applies both. Each module of sign-in has its own numbered chain of steps, the only source of its tables: `auth` (users, sessions, accounts, codes and signing keys), `two_factor`, `passkeys`, `sign_in_policy`, `staff_sign_in`, `organizations`, `mcp`, `personal_access_tokens`, `mail_senders` and `platform_devices`. A step is written against the store's [names](#table-and-column-names), so it makes the tables and columns under the names the app configures, and a step that adds columns to another module's table, such as `organizations` adding the organization of each user, session and personal access token, adds them only while that module is on. The store records each step it applied in its `auth_steps` table, one row per module, step and the module whose tables it changes, so the columns one module adds to another's tables are recorded apart from the step's own tables. A store an earlier Protobase made recorded versions instead, in `auth_migrations`, the numbers of the single chain the store had before its modules had chains of their own: the next file makes `auth_steps` from them, each version as the steps that shared it, such as version 13 as `auth` 4, `passkeys` 2, `staff_sign_in` 2 and `organizations` 2, and `auth_migrations` is read no more. When an upgrade of Protobase brings new steps, write them as the project's next migration:

```sh
bun run db:migrate                  # the database at the project's current schema
bun run protobase auth migration    # reads auth_steps; writes the steps not applied as db/migrations/NNN_auth.sql
bun run db:migrate                  # applies them
```

Each step's statements come under a comment naming its module, number and name, such as `-- auth 2 account_keys: ...`, and each is followed by its row in `auth_steps`. The file only adds tables, nullable columns, columns with a default, and indexes, and the `pg_trgm` extension that the index of the users' names needs, never drops, retypes or tightens anything, so it is safe to apply unattended; Protobase's tests lint every step it ships for this. A step that assumes something of the rows already there starts with a check that refuses before it changes anything: `auth` step 2, which makes one account per provider and account id, stops when two accounts share both, naming them, so you keep one of each in a migration of your own written before it, then apply again. The file is plain SQL to review, edit or leave out where the project handles the auth schema itself. `--dir` and `--name` choose the folder and the name after the number. [`protobase migration`](/reference/cli/#migration) writes the same steps from the project's `protobase.snapshot.json` instead of the database, so it needs no database, along with what the config's other features need, such as [jobs](/reference/jobs/). The file `auth migration` writes starts with Protobase's lines and brings the store to every step of this version, so it also starts the project's snapshot, or moves it on, and `protobase migration` goes on from there.

A store has the tables of the modules the config turns on, and no table, column or index of the others. A module is on while its feature is: `organizations` with [`auth.organizations`](#organizations), `mcp` with [`auth.mcp`](#oauth-for-mcp-clients) or `openIdProvider`, which share its tables, `personal_access_tokens` with [`auth.personalAccessTokens`](/reference/personal-access-tokens/), and `mail_senders` with [`auth.personalMail`](/reference/config/sign-in/#authpersonalmail), and `platform_devices` with [device sign-in](#device-accounts): a provider of `auth.signInProviders` with `devices: true`, or [`auth.signInDevices`](/reference/config/sign-in/#authsignindevices) for the platform's providers from the environment, as a migration is written from the config alone. `auth`, `two_factor`, `passkeys`, `sign_in_policy` and `staff_sign_in` are always on: those features have no switch. Turning a feature on is a migration: the next `protobase migration` or `protobase auth migration` writes its module's steps, and the statements the modules already on add to its tables, and the server refuses to start with the feature on until that file is applied. The columns a module adds to another's table, such as `user.last_organization_id`, are made with that module. SAML providers and open sign-up keep nothing in the store.

#### Turning a module off

Taking a feature out of the config turns its module off, and the next [`protobase migration`](/reference/cli/#migration) asks what becomes of its tables and rows; without a terminal, `--off keep` answers. The answer is recorded in `protobase.snapshot.json`, under `decisions.modules.kept`, with the step the module had and its tables' names. `keep`, the default, applies at once: the tables and rows stay as they are, the module stays at its step, and each column it adds to the tables of the modules still on loses `not null`, so the code that no longer writes it still inserts rows, and is watched for the code that still does, such as the version before once rolled back: a trigger on each counts the rows written with it set, by hour, in `retired.writes` (`table_name`, `column_name`, `hour`, `writes`), the schema `retired` made by the first file that retires a column. Turning the module on again stops the watch, and the column is in use again under its name with the values it kept. A personal access token's `organization_id` stays required, as tokens made while organizations are off are made in [the default organization](#the-default-organization). For personal access tokens the question says they stay valid unless deleted. <gap>A module turned off cannot have its tables archived or deleted because waiting for an update to count as successful, by its manual sign-off, is not implemented.</gap> `--off archive` and `--off delete` are refused, naming keep. `protobase auth migration` refuses a config that turns a module off or on again since the snapshot, and says to run `protobase migration`.

Turning a kept module on again writes the rest of its steps after the one it was kept at, and refuses a table or column name the config changed meanwhile, as for a module that stays on; and again what the modules on add to its tables, which their guard skips where the database has it. Its rows come back into use, such as personal access tokens, which act for their users again, so the file starts with a check that refuses while its tables hold rows, naming each table with its count, unless it is applied with [`protobase migrate --force`](/reference/cli/#migrate). With `DATABASE_URL` set, `protobase migration` counts them first and refuses the same way, asking on a terminal whether to bring them back, or taking `--force`; with empty tables it neither asks nor refuses.

The names the app configures, the store's schema ([`auth.schema`](/reference/config/sign-in/#authschema)), its [tables and columns](#table-and-column-names), and uuid ids (`generateUserId: 'uuid'`), are the ones in effect when the file is written. Changing one later is a migration of the project's own, such as a rename. <gap>`protobase auth migration` cannot rename a table or column the store has already because writing a rename from a changed name is not implemented.</gap>

The server never changes the schema, and never compares it with what Better Auth needs. `protobase serve` and `protobase dev` read the database's [record of migrations](/guides/deploy/#the-record-of-migrations), `migrations.history`, at startup and refuse to start while it lacks a step of this Protobase, naming the module and step, or while the database is ahead of this Protobase by a migration that is not additive. Each migration records itself there; `auth_steps` stays the steps' own record, which each step's file reads to skip a step the database has. The examples' `db:migrate` applies all pending files in one transaction, so a migration that fails leaves the database as the running version expects it. The host must guarantee the rest: nothing but the migrations writes while they run, and the new version serves only after they succeeded. Only [`protobase dev`](/reference/cli/#dev), on the developer's machine, compares the store's tables with what the app's Better Auth needs, and warns at startup about each table, column or index that drifted, such as one changed by hand.

No resource may be over a table of the store, which holds password hashes, sessions, tokens and signing keys: `protobase serve` and `protobase dev` refuse to start with one, naming it, whatever the table is called, and [`protobase scaffold`](/reference/cli/#scaffold) never writes one. The API, the Supabase-compatible endpoints, live updates and MCP read the app's resources only, so none of them reads the store.

A store made before 0.48, when `protobase auth migration` compared the database with Better Auth's tables, has no record of its steps. For it, `protobase auth migration` writes the step that adopts it, once: it runs every step in a scratch schema, in a transaction it rolls back, to find the tables and columns each version makes, records the steps of each version whose tables and columns the store has, with their types, as applied, and writes the steps of the versions whose tables it has none of, such as MCP's for an app that never turned MCP on. The file checks again, when it is applied, that the store has every table and column it adopts, and stops otherwise, naming them. A store that has only some of a version's tables and columns, or has them with other types, is refused, naming what differs: bring it to the schema of Protobase 0.47 first, with that version's `protobase auth migration`. A store set up by Protobase 0.6, with Better Auth's camelCase names, or by `auth:migrate` before it, goes through 0.47 the same way.

### Table and column names

Each module of the store declares its tables and columns once, under built-in names, snake_case like the app's (`sign_in_policy.platform_sign_in`, `session.user_id`); the code and the API keep Better Auth's camelCase names. The modules and their tables:

- `auth`: `user`, `session`, `account`, `verification`, `jwks`, `auth_steps` and `auth_migrations`.
- `two_factor`: `two_factor`, and the user's `two_factor_enabled`.
- `passkeys`: `passkey`.
- `sign_in_policy`: `sign_in_policy`.
- `staff_sign_in`: `staff_sign_in`.
- `organizations`: `organization`, `member` and `invitation`, whose rows each belong to one organization, and the user's `last_organization_id`, the session's `active_organization_id` and the personal access token's `organization_id`.
- `personal_access_tokens`: `personal_access_token`.
- `mcp`: the OAuth provider's `oauth_client`, `oauth_resource`, `oauth_client_resource`, `oauth_refresh_token`, `oauth_access_token`, `oauth_consent` and `oauth_client_assertion`.
- `mail_senders`: `mail_sender`.
- `platform_devices`: `refused_account` and `device_session`.

[`auth.tables`](/reference/config/sign-in/#authtables) gives any of them another name in the database: `prefix` goes before the name of every table it does not name, and each table, by its built-in name, takes its own `name` and `columns`, each column by its built-in name. A name it leaves out stays built-in, and `id` always keeps its name. The migrations make the tables and columns under these names, and sign-in, sessions, tokens and Protobase's own queries of the store read and write them so.

```ts
auth: {
  tables: { prefix: 'app_', user: { name: 'people', columns: { role: 'app_role' } }, session: { columns: { user_id: 'person_id' } } },
}
```

Here the user table is `people`, with its roles in `app_role`, and every other table starts with `app_`, such as `app_session`, whose `person_id` holds its user.

Postgres keeps the first 63 bytes of a name and drops the rest, so the server refuses to start with a name `auth.tables` gives past 63 bytes, naming the setting and its length. It refuses a table or column the store does not have, `id`, and a name two tables, or two columns of one table, would share. Each index is named after its table, such as `app_session_user_id_idx` for `session_user_id_idx`; a prefixed table name or an index name past 63 bytes is cut to its start and `_` and the first 8 hex digits of its SHA-256, the same every time.

### An existing users table

The store can use a users table another system made, such as Supabase's `auth.users`, so its rows keep signing in and every foreign key, trigger and function that names the table keeps working:

```ts
auth: {
  tables: { user: { name: 'users', columns: { role: 'app_role' } } },
  users: { metadata: 'raw_user_meta_data', guardedSchemas: ['auth'] },
  passwordHashes: ['bcrypt'],
  generateUserId: 'uuid',
}
```

- `tables.user.name` names the table, default `user`. `tables.user.columns` maps a column, by its built-in name (`name`, `email`, `email_verified`, `email_confirmed_at`, `image`, `created_at`, `updated_at`, `role`, `banned`, `ban_reason`, `ban_expires`, `two_factor_enabled`, `last_role`, `last_organization_id`), to the table's own; here the app's roles go to `app_role`, since Supabase's `role` holds the Postgres role. The other tables point at this one (see [Table and column names](#table-and-column-names)).
- `users.guardedSchemas` names the schemas where the other system keeps the rest of its sign-in data, such as Supabase Auth's `auth`, with its identities, sessions, refresh tokens and two-factor secrets. Every table in them, including one the other system adds later, counts among the store's tables: no resource may be over it and the assistant's queries never read it. Name only a schema that holds none of the app's own tables.
- `users.metadata` names a JSON column for each user's metadata, which the migrations add as `jsonb` when the table lacks it: `createUser(auth, { ..., metadata: { full_name: 'Carol' } })` writes it, so a trigger that reads `raw_user_meta_data->>'full_name'` sees it.
- `passwordHashes: ['bcrypt']` also verifies bcrypt hashes (`$2a$`, `$2b$`, `$2y$`), and stores the password again as Better Auth's own scrypt after its first sign-in. The 12-character minimum holds for new passwords only, so a shorter existing one still signs in.
- `generateUserId: 'uuid'` makes each new user's id a random UUID in the server, for a table whose `id` is a `uuid` without a default, and makes every id column of the other tables a `uuid` too.

The store's migrations make the user table only when it is missing, and add each of its columns only when the table lacks it, so a table another system made keeps its own. A required column (`name`, `email`, `email_verified`) cannot be added to a table with rows, so the columns Better Auth needs that the table lacks come first, nullable, from a migration of the project's own; `protobase auth migration` then writes the other tables next to it, and another migration fills the columns from what the other system recorded and gives each password its `credential` row in `account`. For Supabase, [`protobase import supabase`](/reference/cli/#import-supabase) writes all three and these options.

### A view over another system's users

Where the app may not change the other system's users table, as on a Supabase database, where only Supabase Auth may change its `auth` schema, the user table can be a view of the app's own over it. `users.keyTable` names the table that holds the user ids:

```ts
auth: {
  schema: 'app_auth',
  tables: { user: { name: 'users', columns: { role: 'app_role' } } },
  users: { keyTable: { schema: 'auth', table: 'users' }, guardedSchemas: ['auth'], metadata: 'raw_user_meta_data' },
  passwordHashes: ['bcrypt'],
  generateUserId: 'uuid',
}
```

The store's migrations then make nothing of the user table, which a migration of the project's own makes as a view with an `instead of` trigger for Better Auth's writes, and every foreign key points at the key table. `protobase dev` compares the view's columns with what Better Auth needs, rather than reporting it as a missing table. The key table counts among the store's tables, so no resource may be over it and the assistant's queries never read it, since it holds the other system's password hashes. The key table's schema is not guarded on its own, since it may hold the app's tables; `users.guardedSchemas` guards the other system's other tables, here Supabase Auth's whole `auth` schema. On a Supabase database, [`npm create protobase`](/getting-started/#on-an-existing-database) writes these settings and the view.

## Configuration

| Variable | |
| --- | --- |
| `PROTOBASE_SECRET` | the app's secret, the default of `secret`: signs cookies and encrypts the token keys; `openssl rand -base64 32`; never committed (`.env.example` has a placeholder) |
| `PROTOBASE_PREVIOUS_SECRETS` | the app's secrets before `PROTOBASE_SECRET`, newest first, comma separated, the default of `previousSecrets`; see [Changing the secret](#changing-the-secret) |
| `PROTOBASE_URL` | the app's public URL, the default of `url` (in `protobase dev` and the local commands that build sign-in, such as `users create`, the dev server's own); issuer and audience of the tokens; when tunnelling, the https tunnel URL |
| `PROTOBASE_TRUSTED_ORIGINS` | extra comma separated origins, the default of `auth.trustedOrigins`; a dev tunnel needs its exact host here, such as `https://my-tunnel.trycloudflare.com`, since none is trusted by default; an entry with `*` trusts every host it matches |
| `PROTOBASE_ORIGINS` | the other origins the app is served on, comma separated, passed by the platform; see [Several origins](#several-origins) |
| `PROTOBASE_PASSKEY_DOMAIN` | the host new [passkeys](#passkeys) are made for, passed by the platform; default the host of the app's `url` |
| `PROTOBASE_LOCKED_ACCOUNTS` | the addresses of accounts no one may take over, comma separated, passed by the platform, such as a demo's shared account: their address, password, passkeys, two-factor authentication, linked accounts and [personal access tokens](/reference/personal-access-tokens/) stay as they are, from any endpoint or host call, which fails with `403 ACCOUNT_LOCKED`, and they cannot be deleted |
| `PROTOBASE_SIGN_UP_DOMAINS` | the email domains [open sign-up](#sign-up-for-email-domains) takes, comma separated, passed by the platform: it replaces `signUp.domains`, and empty it leaves open sign-up off |
| `PROTOBASE_CORS_ORIGINS` | other websites whose browser code may call the API, `*` or comma separated http and https origins, passed by the platform; see [CORS](/reference/api/#cors) |
| `PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM` | the mail server and sender for [password reset](#password-reset), [emailed sign-in codes](#emailed-sign-in-codes), emailed [two-factor](#two-factor-authentication) codes and [open sign-up](#open-sign-up), passed by the platform; all four are off without them |
| `PROTOBASE_APP_NAME` | the app's name, passed by the platform: it overrides `name` |
| `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID`, `PROTOBASE_SIGN_IN_CLIENT_SECRET` | the [platform sign-in provider](#platform-sign-in-providers) for people who have an account, passed by the platform; off without them. `PROTOBASE_SIGN_IN_PROVIDER`, `PROTOBASE_SIGN_IN_NAME`, `PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS`, `PROTOBASE_SIGN_IN_HIDDEN`, `PROTOBASE_SIGN_IN_BUTTON` and `PROTOBASE_SIGN_IN_DEVICES` are optional, and `PROTOBASE_SIGN_IN_TOKENS=true` turns on its [token sign-in](#token-sign-in). `PROTOBASE_SIGN_IN_<ID>_ISSUER` and so on add [more providers](#more-than-one-provider), each named by its id |
| `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID`, `PROTOBASE_OPERATOR_CLIENT_SECRET` | the [operator provider](#operator-provider) its staff sign in with to sign in as people, passed by the platform; staff sign-in is off without them. `PROTOBASE_OPERATOR_NAME` and `PROTOBASE_OPERATOR_GROUP` are optional |
| `PROTOBASE_TRUSTED_PROXIES` | the proxies in front of `protobase serve`, addresses or CIDR ranges, comma separated, such as `172.30.87.1`, the Docker network's gateway in the [compose template](/guides/deploy/#compose-template); see [Client addresses](#client-addresses) |

- Cookies are `SameSite=Lax`. When the app's `url` is https they are `__Host-` cookies (`__Host-better-auth.session_token`): `Secure`, on `Path=/` and without a `Domain`, so another app on a sibling host of a shared domain cannot set a session or a sign-in flow cookie for this one. When it is http with a port, their names carry it (`better-auth-5173.session_token`), because a browser shares cookies across the ports of a host: two apps on `localhost` then keep their own sign-ins.
- Sign-in is rate limited (5 password attempts per minute and client by default, `signInPerMinute`, which also limits [sign-up](#open-sign-up) requests; 3 per minute for emailed codes); [Client addresses](#client-addresses) says how a client is known. Reading the session, the role it acts with and its token (`/api/auth/get-session`, `/api/auth/role/current` and `/api/auth/token`), which every page load does, is never limited.
- New passwords need at least 12 characters.
- `name`, at the config's top level, is the app's name: authenticator apps and passkey prompts show it, the admin app's sidebar shows it at the top beside the app's [icon](/reference/app-identity/#the-icons), else its initial (Protobase's mark and wordmark when it is `Protobase`), the sign-in page's title names it, every browser tab of the admin app ends its title with it, the [installed app](/reference/installable-app/) is called by it, the [auth emails](/reference/email/#protobases-own-mail) name the app with it, and the platform's mailer sends them as it (the sender's display name). `PROTOBASE_APP_NAME`, when set, overrides it; without either it is `Protobase`, then without a display name. See [App identity](/reference/app-identity/).

### Hooks

Sign-in runs the project's own code from `auth/hooks.ts`, which Protobase finds by that path and loads when it builds sign-in. Each hook is a named export, typed with `AuthHooks` from `@protobase/server`, and gets the app's database, `{ db }` (Kysely), as its last argument, which keeps the [organization's tables](/guides/api-functions/#the-organizations-tables) to the organization the hook is about, and to none for a hook about none, such as `onUserCreated`:

```ts
// auth/hooks.ts
import { sql } from 'kysely'
import type { AuthHooks } from '@protobase/server'

export const generateUserId: AuthHooks['generateUserId'] = async ({ db }) => {
  const { rows } = await sql<{ id: string }>`select nextval(pg_get_serial_sequence('core.users', 'id'))::text as id`.execute(db)
  return rows[0]!.id
}
```

| Hook | |
| --- | --- |
| `generateUserId` | the id of a new user, by any route; see [User ids](#roles-and-access-in-the-api) |
| `onUserCreated` | `(user, context, { db })`, after a user is created by any route: `protobase users create`, an admin, [open sign-up](#open-sign-up) or a [sign-in provider](#sign-in-with-github) |
| `generateOrganizationId` | the id of a new [organization](#organizations); default a random UUID |
| `onOrganizationCreated` | `({ organization, member }, { db })`, after an organization is created, with its owner's membership; `db` works in the new organization |
| `beforeOrganizationDeleted` | `(organization, { db })`, before an organization is deleted; throwing refuses it; `db` works in that organization |
| `organizationHooks` | Better Auth's organization hooks by name, each with `{ db }` last, run after Protobase's own; `db` works in the organization the hook's input names |
| `senderVerifiers` | `(add_verifier)`, once as the app starts: adds the app's ways to prove a From address; see [Verifying a From address](/reference/email/#verifying-a-from-address) |

A mailer of the project's own, for sign-in's mail, is the default export of `auth/mailer.ts` (see [Password reset](#password-reset)). An authenticator of its own, in place of the one `authenticate` describes, is the default export of `auth/authenticate.ts` (see [Tokens and roles](#tokens-and-roles)).

### Client addresses

The rate limits count each client address on its own: an IPv4 address, or an IPv6 address by its /64. `protobase serve` and the runtime image find it themselves and pass it on in `X-Forwarded-For`, replacing whatever the client sent:

- Without `PROTOBASE_TRUSTED_PROXIES`, the client is the address the connection comes from. That fits clients that reach the server directly, such as a browser on the same machine as `docker run -p 127.0.0.1:8787:8787`.
- Behind a reverse proxy (Caddy, nginx, Traefik, a load balancer), every connection comes from the proxy, so every client would share its one limit, and three emailed codes a minute from anyone would stop everyone signing in. Set `PROTOBASE_TRUSTED_PROXIES` to the proxy's address, or the Docker network's gateway for a proxy on the host, such as `172.30.87.1` in the deploy guide's [compose template](/guides/deploy/#compose-template); a range must not cover the clients themselves, or they all share the one limit again. Have the proxy append the address it took the request from to `X-Forwarded-For` (Caddy and Traefik do by default, nginx with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`). The client is then the rightmost address in it that is not a trusted proxy, so one the client wrote itself counts for nothing. Behind several proxies, such as a CDN in front of Caddy, trust them all.

An app served another way than `protobase serve`, such as its own server around `createAdmin`, gets what its server passes: the limits read `X-Forwarded-For` holding one address, and requests without one share a single limit.

## First run

Accounts are never created over the web while the store is empty: there is no setup route, and [open sign-up](#open-sign-up), when an app turns it on, waits for the first admin, so a freshly deployed URL cannot be claimed by whoever reaches it first. The first admin is created on the host, with the CLI (`protobase users create you@example.com --generate-password`, or `--no-password` for an account that signs in by emailed code, passkey or a sign-in provider only). The `users` commands call these functions of `@protobase/server`, on the app's sign-in. A script of the project's own, such as a seed, builds that sign-in as the commands do, from the project's config and `DATABASE_URL`, with `loadProjectAuth` of `@protobase/cli/auth`:

```ts
import { loadProjectAuth } from '@protobase/cli/auth'
import { createUser, deleteUser, hasUsers, listUsers, setUserBanned, setUserRole } from '@protobase/server'

const auth = await loadProjectAuth(process.cwd())            // the project's folder; its .env is loaded too

await createUser(auth, { email, password?, name?, role? }) // the first user is always an admin; later ones default to `user`
await hasUsers(auth)                                         // boolean
await listUsers(auth, { after?, size? })                     // a page, oldest first: { users: [{ id, email, role, banned, createdAt }], next? }, never passwords
await setUserRole(auth, { email, role })                     // a role of auth.roles, or several comma separated
await setUserBanned(auth, { email, banned })                 // banning ends the user's sessions and blocks sign-in
await deleteUser(auth, email)                                // with sessions and accounts
```

`listUsers` answers a page of `size` users (500 unless told), as Postgres pages them by creation; pass its `next` as `after` for the page after, until a page has no `next`. The last active admin cannot be deleted, demoted or banned: those functions throw instead, and Better Auth's admin endpoints answer `400 LAST_ADMIN`, so every caller is protected. An account created by `createUser` or an admin counts as having a verified address, since whoever created it vouches for it; that lets it sign in with an [emailed code](#emailed-sign-in-codes).

Until a user exists sign-in fails, and `GET /api/auth/status` (public) answers `{ "needsAdmin": true, "signInMethods": ["password", "passkey"], "passwordReset": false, "socialProviders": [] }` so a login page can say what to do. The admin app's page then shows the `users create` command to run on the host. A hosting platform where nobody runs commands on the host sets `PROTOBASE_FIRST_ADMIN_URL` to its own page where the first user is added, such as its console's; the status then also answers `firstAdminUrl`, and the page links there in place of the command. `signInMethods` lists the ways to sign in the [sign-in policy](#sign-in-policy) leaves on (`password`, `emailCode`, `passkey`), `passwordReset` is whether [reset mail](#password-reset) can be sent and passwords are on, `signInFirst`, when there, says the page leads with an [emailed code](#emailed-sign-in-codes), `signUp`, when there, says anyone can [make an account](#open-sign-up), and `staffSignIn`, when there, names the provider of [staff sign-in](#staff-sign-in). Further users are created by an admin on the [Users page](#users-page), or with `createUser` on the host. The auth store holds a connection pool; scripts that call these functions end the process themselves.

## Users page

Admins manage accounts without the command line on the Users page, an ordinary [composed page](/reference/layouts/) the config imports: everyone who can sign in, found by address, with their roles to tick, Block and Unblock, inviting someone by email, and adding an account directly.

```ts
// config/index.ts
export { usersPage } from '@protobase/layout'      // at /accounts, for admins
// config/user-menu.ts
export const accountMenu = userMenu((m) => [m.page('accounts', { label: 'Users', icon: 'users' })])
```

New apps have it already. Leave the export out to drop it, or make a page of your own around the [`Users` block](/reference/blocks/#users). It works with or without [organizations](#organizations): an invitation to the app makes an account with the roles the admin ticked, from the same link page and sign-up as an organization's invitation, or from [open sign-up](#open-sign-up) with the invited address, and someone with an account just signs in. Listing, creating, roles and blocking are Better Auth's admin endpoints (`/api/auth/admin/list-users`, `create-user`, `set-role`, `ban-user`, `unban-user`), whose roles go as a list; the rest are Protobase's, for admins only:

| Endpoint | Does |
| --- | --- |
| `POST /api/auth/users/invite` | `{ email, roles }`: invites an address without an account, for 7 days (`invitationDays` with organizations). Inviting it again replaces the invitation. Without a mailer the answer carries the `link` to pass on. |
| `GET /api/auth/users/invitations` | The pending invitations to the app: `{ invitations: [{ id, email, roles, expiresAt }] }`. |
| `POST /api/auth/users/invitations/cancel` | `{ id }`: revokes one, so its link stops working. |
| `GET /api/auth/users/roles` | Every role with its label, to choose from. |

An invitation to the app is a row of Better Auth's `verification` table, so it needs no table of its own. The client has these as `session.users`.

## Account page

Everyone signed in has an account page at `/-/account`, which "Account" in the user menu opens. When the config exports no page named `account`, the server serves the standard one, `accountPage` from `@protobase/layout`: a [composed page](/reference/layouts/) titled "Account" with five [tabs](/reference/blocks/#tabs-and-tab) of [account blocks](/reference/blocks/#account-blocks), each tab at its own address.

| Tab | Address | Blocks |
| --- | --- | --- |
| Profile | `/-/account` | `Profile`, `PersonalMail`, `Connections`, `DeleteAccount` |
| Sign-in & security | `/-/account/security` | `Password`, `Passkeys`, `TwoFactor`, `ConnectedAccounts` |
| Devices | `/-/account/devices` | `Devices` |
| Connected apps | `/-/account/apps` | `ConnectedApps` |
| Access tokens | `/-/account/tokens` | `PersonalAccessTokens` |

A tab whose blocks all leave themselves out is not offered, such as Connected apps in an app without [MCP](#oauth-for-mcp-clients) and Access tokens in an app without [personal access tokens](/reference/personal-access-tokens/). `DeleteAccount` leaves itself out when the app turns [account deletion](#deleting-the-account) off, `PersonalMail` in an app without [personal mail](/reference/email/#from-someones-own-mailbox), and `Connections` when no workflow plugin declares a [connection](/reference/workflows/#connecting-an-account).

To change it, export a page named `account` of your own: it replaces the standard one at `/-/account`, and is neither at `/account` nor in the sidebar. `accountTabs` holds the standard tabs by name (`profile`, `security`, `devices`, `apps`, `tokens`), so the page lists the ones it keeps beside its own:

```tsx
// config/account.tsx
import { accountTabs, Card, page, Page, Passkeys, Tab, Tabs, TwoFactor } from '@protobase/layout'

export const account = page('account',
  <Page title="Account">
    <Tabs>
      <Tab name="security" label="Sign-in & security">
        <Card title="Company policy">Staff sign in with a passkey.</Card>
        <Passkeys />
        <TwoFactor />
      </Tab>
      {accountTabs.profile}
      <Tab name="privacy" label="Privacy">
        <Card title="Analytics">We count visits without cookies.</Card>
      </Tab>
    </Tabs>
  </Page>)
```

- **Add** a tab of your own, here Privacy at `/-/account/privacy`, with any blocks a page can hold.
- **Hide** a tab by leaving it out, here Devices and Connected apps, or a block by leaving it out of its tab, here `ConnectedAccounts`.
- **Reorder** by listing the tabs in the order to show them: Sign-in & security comes first here, at `/-/account`.
- **Wrap** a standard tab by writing it with its name and label, the standard blocks among your own, as the security tab above does with a note.

A tab of personal settings, such as which emails someone gets, is a [`Settings`](/reference/blocks/#settings) block over a resource with one record per person: the fields come from the resource, and each person reads and changes only their own.

The page is checked like any other, and the account blocks are allowed on it alone. A config that [extends](/reference/cli/#extending-a-config) another and exports `account` too is the error of a page defined twice.

## Password reset

With mail configured, the sign-in page offers "Forgot password?": the person enters their email, gets a link, and chooses a new password on the page the link opens. It is Better Auth's own reset: `POST /api/auth/request-password-reset` with `{ email, redirectTo }`, the emailed link `GET /api/auth/reset-password/<token>`, which sends the browser back to `redirectTo` with `?token=...` (or `?error=INVALID_TOKEN`), and `POST /api/auth/reset-password` with `{ token, newPassword }`.

```sh
PROTOBASE_SMTP_URL=smtps://user:password@smtp.example.com:465   # or smtp://...:587, which requires STARTTLS unless the URL ends in ?requireTLS=false
PROTOBASE_MAIL_FROM=noreply@admin.example.com
```

Sign-in reads both from the environment; the platform passes them, like `DATABASE_URL`. Set both or neither: one without the other, a URL that is not `smtp://` or `smtps://`, or a sender that is not a plain address stops the app at start with an error. Without them reset is off: `GET /api/auth/status` says `"passwordReset": false`, the page shows no link, and a reset request answers `400` (`RESET_PASSWORD_DISABLED`). A project can send the mail itself instead, with a `Mailer` as the default export of `auth/mailer.ts`, or turn mail off whatever the environment says, with `auth: { mailer: false }`:

```ts
// auth/mailer.ts
import type { Mailer } from '@protobase/server'

export default { send: async ({ to, subject, text }) => { /* deliver it */ return {} } } satisfies Mailer
```

[Jobs](/reference/jobs/#mail) send their own mail through the same server, or the same `auth/mailer.ts`, with `mail` in their context, and so do the app's [email templates](/reference/email/) given it.

- The email names the app and gives the link, as a button and in its plain-text part, that it works for 1 hour and once, and that it can be ignored (see [Protobase's own mail](/reference/email/#protobases-own-mail)).
- The SMTP client greets the server with the sender's domain (`admin.example.com` above), not the container's `[127.0.0.1]`; a `?name=` on `PROTOBASE_SMTP_URL` overrides it.
- A request answers the same whether or not the address has an account, and the mail goes out after the answer, so neither the response nor its timing tells. A send that fails is logged by Better Auth; one the server does not finish within 30 seconds fails with `MAIL_SERVER_TIMEOUT` (see [When the server does not answer](/reference/email/#when-the-server-does-not-answer)), so the failure is in the log while an emailed code still works.
- Requests are limited to 3 per minute and client. Setting a new password ends all of the user's sessions; the new password needs 12 characters like any other.
- `redirectTo` must be on a trusted origin (the app's `url`, one of its [other origins](#several-origins) or `auth.trustedOrigins`); the admin app sends its own page with a `password-reset` marker, so the link opens the set-password page there.
- The link is on the origin the reset was asked on, when that is one of the app's.
- While the [sign-in policy](#sign-in-policy) turns passwords off, reset is off too (`403`).

## Name, password and devices

The signed-in person changes their own name and password, and signs out their other devices, with Better Auth's own endpoints. The client has them in `session.account`, each rejecting with `AuthError`, or with `NetworkError` when the server cannot be reached:

| Client | Endpoint |
| --- | --- |
| `updateName(name)` | `POST /api/auth/update-user` with `{ name }` |
| `changePassword(current, next)` | `POST /api/auth/change-password` with `{ currentPassword, newPassword }`, for an account that has a password (a wrong one is `INVALID_PASSWORD`) |
| `setPassword(next)` | `POST /api/auth/account/set-password` with `{ newPassword }`, for an account without a password, such as one that signs in with [emailed codes](#emailed-sign-in-codes) or [GitHub](#sign-in-with-github); one that has a password already is `PASSWORD_ALREADY_SET` |
| `sessions()` | `GET /api/auth/list-sessions`: the devices signed in now, each `{ token, current, userAgent?, ipAddress?, createdAt, updatedAt, expiresAt, staff? }`, with `current` for this one and `staff` for a [staff session](#staff-sign-in) |
| `revokeSession(token)` | `POST /api/auth/revoke-session` with `{ token }`: signs out that device |
| `revokeOtherSessions()` | `POST /api/auth/revoke-other-sessions`: signs out every device but this one |

Signing out a device stops that device's API token at its next request (see [When a token stops working](#when-a-token-stops-working)); this device stays signed in. A password change always signs out every other device, whatever `revokeOtherSessions` says, and disconnects the account's [MCP clients](#oauth-for-mcp-clients); this device gets a new session and stays signed in. A first password with `setPassword` signs out no device and disconnects no [MCP client](#oauth-for-mcp-clients); it needs 12 characters like any other, is limited to 5 per minute and client, and is refused while the [sign-in policy](#sign-in-policy) turns passwords off (`403`). A [staff session](#staff-sign-in) cannot change or set the password or sign out the other devices (`STAFF_CANNOT_CHANGE_SIGN_IN`).

When the app has mail, the account's address is emailed that its password changed, with a link to choose a new one if it was not them: after a change, a first password, a [reset](#password-reset), an admin setting it, and a new password through the [endpoints for supabase-js](#supabase-js-and-supabasessr).

Checks of the signed-in account's current password are limited to 5 a minute for each account, on top of the limit for each client: changing the password, deleting the account, turning [two-factor authentication](#two-factor-authentication) on or off, its authenticator link and new backup codes, `POST /api/auth/verify-password`, and [confirming a first passkey](#confirming-an-account-change) with the password. Every check counts, a right one too; one over the limit is refused with `429` (`TOO_MANY_PASSWORD_CHECKS`, with `X-Retry-After` in seconds), so a stolen session cannot guess the password from many addresses. <gap>The current-password limit cannot be shared between server instances, each of which counts on its own, because a shared store for it is not implemented.</gap>

On the [account page](#account-page), the `Password` block does both: with a password, it asks for the current one and the new one twice, and says the other devices are signed out; without one, it sets the first, and nobody is signed out. While the sign-in policy turns passwords off, or in a staff session, it only says so.

The [account page](#account-page)'s Devices tab lists the sessions with this one first and marked, a Sign out on each other one and Sign out of all other devices. It names each by its browser and system from the user agent, and a staff session by the operator alone, such as "Protobase staff" with when it signed in and until when, never the staff member. Devices a [platform provider of devices](#device-accounts) links are listed by their own name, each with the sessions it began.

## Deleting the account

Everyone signed in can delete their own account: the account page's Profile tab ends with "Delete account", which asks them to confirm in a dialog, with their password when the account has one. It is on by default, since an app store requires an app that makes accounts to let people delete them in the app, and `accountDeletion: false` turns it off, for an app whose accounts an organization's admins manage:

```ts
auth: { accountDeletion: false }
```

It is Better Auth's own deletion, `POST /api/auth/delete-user` with `{ password }`, which the client has as `session.deleteAccount(password?)` and `GET /api/auth/status` offers as `"accountDeletion": true`. It deletes the user with their sessions, sign-in methods and linked accounts, as an admin's [removal](#users-page) does, along with what the app keeps of them elsewhere, such as their [devices for push](/guides/push-notifications/), and their [MCP clients](#oauth-for-mcp-clients)' grants; the app's own records that point at the user stay. This device is signed out, and the address can no longer sign in.

- Without a password, as for someone who signs in with [emailed codes](#emailed-sign-in-codes) or a passkey, a session that signed in more than a day ago must [confirm it's them](#confirming-an-account-change) first, else it is `403 STRONG_SIGN_IN_REQUIRED`; the dialog asks for it in place. A wrong password is `INVALID_PASSWORD`.
- The last active admin cannot delete themselves (`400 LAST_ADMIN`), nor can an account in `PROTOBASE_LOCKED_ACCOUNTS` (`403 ACCOUNT_LOCKED`); nothing is deleted then.
- A [staff session](#staff-sign-in) cannot delete the account (`STAFF_CANNOT_CHANGE_SIGN_IN`).
- With `accountDeletion: false` the endpoint answers `404` and the page offers nothing. Better Auth's emailed confirmation link (`/delete-user/callback`) is always off.

## Leaked passwords

`leakedPasswords: true` refuses a new password that appears in a known data breach. It is off by default, since it sends a request to an outside service each time a password is set.

```ts
auth: { leakedPasswords: true }
```

The check is Better Auth's [haveIBeenPwned](https://www.better-auth.com/docs/plugins/have-i-been-pwned) plugin's: only the first five characters of the password's SHA-1 hash go to Have I Been Pwned's Pwned Passwords range API, which answers with every leaked hash that starts with them, so the password itself never leaves the server. It runs wherever someone chooses a password: [open sign-up](#open-sign-up), an [invitation](#organizations), a first password (`/account/set-password`), a change, a [reset](#password-reset), and an admin adding an account or setting a password, `createUser` on the host included. Signing in never checks.

- A leaked password is refused with `400` and the code `PASSWORD_COMPROMISED`, before anything is saved; Protobase's pages say "This password appears in a known data breach. Choose a different one." The [GoTrue-compatible](#supabase-js-and-supabasessr) `signUp` and `updateUser` answer `422 weak_password`.
- A password outside the 12 to 128 characters is refused for its length, with no lookup.
- While the service cannot be reached, setting a password fails with a `500`; signing in is not affected.

## Changing the address

With mail configured, the account page's Profile tab offers "Change email": the person enters the new address, gets a 6-digit code there, and enters it. Only then does the account move to the new address, which counts as verified; they sign in with it from then on, and this device stays signed in. It is Better Auth's [email OTP](https://www.better-auth.com/docs/plugins/email-otp) plugin's address change, and `GET /api/auth/status` says `"changeEmail": true` while it is offered. The client has it in `session.account`:

| Client | Endpoint |
| --- | --- |
| `requestEmailChange(newEmail)` | `POST /api/auth/email-otp/request-email-change` with `{ newEmail }`: mails the code to the new address |
| `changeEmail(newEmail, code)` | `POST /api/auth/email-otp/change-email` with `{ newEmail, otp }`: moves the account once the code is right (a wrong one is `INVALID_OTP`, an old one `OTP_EXPIRED`) |

- A code works for 10 minutes, once, and three wrong tries end it. Codes are stored hashed.
- An address another account has gets no code, and the answer is the same, so it does not tell who has an account.
- Each endpoint is limited to 3 requests per minute and client. Without mail both answer `404`.
- A [staff session](#staff-sign-in) cannot change the address (`STAFF_CANNOT_CHANGE_SIGN_IN`), and neither can an [MCP client](#oauth-for-mcp-clients)'s token (`401`).

## Emailed sign-in codes

With mail configured, the sign-in page offers "Email me a sign-in code": the person enters their address, gets a 6-digit code, and signs in with it instead of a password. It is Better Auth's [email OTP](https://www.better-auth.com/docs/plugins/email-otp) plugin: `POST /api/auth/email-otp/send-verification-otp` with `{ email, type: "sign-in" }`, then `POST /api/auth/sign-in/email-otp` with `{ email, otp }`.

The code goes in a box per digit, which takes a pasted code and the system's code autofill, and is checked as soon as its last digit is in; **Send a new code** waits 30 seconds after each code that went out. The [sign-up](#open-sign-up) code page works the same; a new address's code is checked once full too, and a two-factor code goes in the same boxes.

By default the page leads with the password and offers the code below it. For an app whose people mostly never set a password, `signInFirst: 'emailCode'` leads with the code instead: the page asks for the address and "Email me a sign-in code", and the password field, with "Forgot password?", waits behind "Use a password". It applies while the [sign-in policy](#sign-in-policy) leaves both on; `/api/auth/status` then answers `signInFirst: "emailCode"`.

```ts
auth: { signInFirst: 'emailCode' }
```

- A code works for 10 minutes, once, and three wrong tries end it; asking again sends a new one and the old one stops working. Codes are stored hashed.
- It creates no account, unless [open sign-up asks for the address only](#sign-up-with-the-address-only): an address no account uses gets no code but an email saying so, which suggests signing in with the address the person signed up with. The answer is the same either way, so it does not tell who has an account.
- Only sign-in codes are mailed this way. The plugin's own email verification and password reset endpoints are off (`404`), and asking for another type of code answers `400`. Its address change is on, as [Changing the address](#changing-the-address) describes.
- An account with [two-factor authentication](#two-factor-authentication) is asked for its second step after the code too, as after a password.
- An account created by Protobase 0.3 or earlier, which has a password, is marked verified the first time it uses a code. Otherwise Better Auth would treat the code as taking over an unverified account and delete its password.

## Open sign-up

Off by default: accounts come from the host, an admin, an [invitation](#users-page) to the app or to an [organization](#organizations), or a [sign-in provider](#sign-in-with-github). An app where anyone may make an account, such as a public portal whose visitors save searches, turns it on with the role new accounts get:

```ts
auth: { roles: ['admin', 'member'], signUp: { role: 'member' } }
```

The sign-in page then offers "Create an account", and so do [sign-in prompts](/reference/ui-config/#sign-in-prompts): the person enters their address, gets a 6-digit code, and enters it on a page of its own. Only once the code is right does the next page ask for their name and a password. The account is made only then, with the address verified, and signed in.

- `role` is one of `roles`, and never `admin`: the app stops at start with an error otherwise. Give it the least a stranger may hold; a request that names another role, or sets `role` through Better Auth's own endpoints, does not get it.
- It needs mail: without a mailer it is not offered, `GET /api/auth/status` has no `signUp`, and its endpoints answer `404`. Not with [organizations](#organizations), whose people join by invitation.
- `POST /api/auth/sign-up/send-code` with `{ email }` mails the code. It answers the same whether the address has an account or not; an address that has one is mailed a note saying so instead of a code, with a link to the sign-in page, so nobody can tell from the answer, and no second account is made.
- `POST /api/auth/sign-up/verify-code` with `{ email, code }` checks the code on its own and answers `{ ticket }`. A code works for 10 minutes, once, and three wrong tries end it; asking again sends a new one. Codes are stored hashed.
- `POST /api/auth/sign-up/create` with `{ ticket, name, password? }` makes the account for the address whose code was right, and signs in. `name` is optional when sign-up [asks for the address only](#sign-up-with-the-address-only). A ticket works for 30 minutes, once, and is stored hashed; a password the policy refuses leaves it for another try. A used or expired one answers `SIGN_UP_TICKET_INVALID`, and the sign-up starts again with the address.
- The password follows the [sign-in policy](#sign-in-policy) as for an invitation: none while passwords are off, optional while emailed codes are on, 12 characters or more. What the policy requires, such as two-factor authentication, is set up after the first sign-in, as for every account.
- An address with a pending [invitation to the app](#users-page) gets its account through the invitation: with the roles the admin ticked instead of `role`, and the invitation is used up, as its link would. A revoked or expired invitation counts as none.
- The three requests are limited per minute and client like sign-in (`signInPerMinute`, default 5), and refused (`NO_ADMIN_YET`) while the store has no user.
- The `onUserCreated` [hook](#hooks) runs for every account made this way.
- `createAuthSession` from `@protobase/client` has the three steps as `sendSignUpCode(email)`, `verifySignUpCode(email, code)`, which resolves to the ticket, and `signUp({ ticket, name, password? })`, which resolves to the signed-in user.

### Sign-up with the address only

An app that needs nothing but a verified address, such as a sign-in server other apps send their people to, has open sign-up ask for the address alone:

```ts
auth: { roles: ['admin', 'member'], signUp: { role: 'member', fields: ['email'] } }
```

- `fields` is what sign-up asks for: `['email', 'name']` by default, or `['email']`. The address is always one of them; any other list stops the app at start with an error.
- The [emailed sign-in code](#emailed-sign-in-codes) then signs in an address that has an account, and makes the account of one that has none, on the spot, once its code is right: verified, with `role`, and an empty name the person can fill in on the [account page](#account-page). Asking for the code answers the same and mails the same email whether the address has an account or not.
- An address with a pending [invitation to the app](#users-page) gets its account through it, as with the sign-up page: the invited roles, and the invitation used up. A revoked or expired one counts as none.
- An address open sign-up does not take, outside [its domains](#sign-up-for-email-domains) or while the store has no user, still gets the no-account email and no account. While the [sign-in policy](#sign-in-policy) turns emailed codes off, asking for one is refused and nothing is made.
- "Create an account" makes the account as soon as its code is right, without asking a name; while the policy needs a password, because emailed codes are off, the last page asks only for that.
- `GET /api/auth/status` answers `signUpFields: ["email"]`, and `["email", "name"]` by default, beside `signUp`.
- Not with [organizations](#organizations), like all open sign-up: their people come in by invitation, and the emailed code never makes an account there.

### Sign-up for email domains

A company's app can let colleagues make their own account while everyone else still needs an invitation, with the email domains open sign-up takes:

```ts
auth: { roles: ['admin', 'member'], signUp: { role: 'member', domains: ['example.com'] } }
```

- An address at one of `domains` (subdomains count, letter case does not) signs up as above, with the emailed code; domains are matched as [SAML providers'](#sign-in-with-saml) are.
- Any other address is refused at each step with `403` (`EMAIL_DOMAIN_NOT_ALLOWED`) before anything is mailed or made, and the sign-up page says the address cannot make an account here. The answer does not name the domains, and `GET /api/auth/status` still only says `signUp`. Invitations and sign-in work as before, whatever the domain.
- `PROTOBASE_SIGN_UP_DOMAINS`, comma separated, replaces `domains` when set, so the deployment or the platform hosting the app decides them, and knows which it set. It only narrows open sign-up: without `signUp` in the config it turns nothing on.
- An empty list, from either, takes nobody: open sign-up is then off, as without `signUp`, never open to all. Without `domains` and the variable, every address may sign up.
- On the [GoTrue-compatible endpoints](#supabase-js-and-supabasessr), `POST /signup` from another address answers `422 signup_disabled`, and `POST /otp` sends a sign-in code, as with open sign-up off.
- On the host, `auth.signUpDomains` is the list in effect and `auth.signUpTakes(email)` whether open sign-up takes an address.
- <gap>A platform cannot read over HTTP the domains an app lists only in its own config because an endpoint that tells them to the platform is not implemented.</gap>

## Passkeys

People add passkeys (Face ID, Touch ID, Windows Hello, a phone or a security key) on their account page, and sign in with "Sign in with a passkey". It is Better Auth's [passkey](https://www.better-auth.com/docs/plugins/passkey) plugin from `@better-auth/passkey`, under `/api/auth/passkey/*`.

- A passkey is made for the app's passkey domain, its RP ID: the host of the app's `url` (`admin.example.com`), or the host of one of its [other origins](#several-origins) set with `auth.passkeyDomain` or `PROTOBASE_PASSKEY_DOMAIN`. For local development, `http://localhost` works.
- Each passkey keeps the RP ID it was made for (`passkey.rp_id`), so changing the passkey domain breaks none. Passkeys made before Protobase kept it count for the host of the app's `url`, which they were made for; renaming that host breaks them. The column is new in 0.10: the server refuses to start until the [migration](#migrations) that adds it is applied.
- A passkey's answer, for adding a passkey or signing in, must name the origin of the app's `url` or one of the [other origins](#several-origins) exactly. An origin listed only in `auth.trustedOrigins`, such as a dev tunnel, cannot use passkeys: list it as one of the other origins instead.
- On an app with several origins, every passkey works on each of them through [Related Origin Requests](https://passkeys.dev/docs/advanced/related-origins/) (Chrome and Edge 128, Safari 18, Firefox 152; at most 5 registrable domains).
- A browser asks for the passkeys of one RP ID at a time. When people have passkeys for more than one of the app's hosts, `GET /api/auth/status` lists them as `passkeyDomains`, the passkey domain first, and the sign-in page adds "Use a passkey made for {host}" for each of the others. `GET /api/auth/passkey/generate-authenticate-options?rpId=<host>` asks for one of them.
- A passkey sign-in asks for no second step: the passkey is something you have and something you are or know.
- Adding a passkey from a session that signed in more than a day ago asks to [confirm it's them](#confirming-an-account-change) first, and the account page asks for it in place; for a first passkey, on an account without a [second step](#two-factor-authentication), the account's password does too.
- Passkeys can be renamed and removed on the account page; removing one here leaves it on the device.

## Two-factor authentication

On their account page, people turn on a second step after a password or an emailed sign-in code, with Better Auth's [two-factor](https://www.better-auth.com/docs/plugins/2fa) plugin:

- **Authenticator app:** the page shows a QR code (and the key, to type in), the person confirms it with a code from the app, and gets ten backup codes that each work once instead of a code. New backup codes replace the old ones.
- **Emailed code:** with mail configured, a 6-digit code mailed at each sign-in, valid for 10 minutes. An account with an app can also choose an emailed code at sign-in. Backup codes come with the app only.

Turning it on, off, or making new backup codes asks for the account's password when it has one. Without one, turning it on, reading the authenticator link (`/two-factor/get-totp-uri`) or making new backup codes from a session that signed in more than a day ago asks to [confirm it's them](#confirming-an-account-change) first, and the account page asks for it in place. At sign-in, a correct password or code, or a [sign-in token](#token-sign-in), answers `{ "twoFactorRedirect": true, "twoFactorMethods": ["totp", "otp"] }` instead of a session, and `POST /api/auth/two-factor/verify-totp`, `verify-otp` or `verify-backup-code` with `{ code, trustDevice? }` finishes it; `trustDevice` skips the step in that browser for 30 days. Ten wrong codes in a row lock the account's second step for 15 minutes.

Signing in through a provider's pages is one factor too, for the app's own [providers](#sign-in-with-github), the [platform's](#platform-sign-in-providers) and [SAML](#sign-in-with-saml) ones alike, since the app cannot check the provider's own second step. A person who turned the second step on comes back from the provider to the page they started from with `?second-step=<methods>`, such as `?second-step=totp`, the two-factor cookie and no session, and the sign-in page asks for the step there. <gap>A sign-in through the [GoTrue-compatible](#supabase-js-and-supabasessr) provider route cannot take the second step, because the GoTrue-compatible endpoints do not offer one; a person who turned it on is sent back with `error=access_denied`, as a password sign-in there answers `insufficient_aal`.</gap>

## Recent strong sign-in

Some values ask for a sign-in that proved a passkey or a second step not long ago, such as a field with [`.strongSignIn()`](/reference/data-config/#recent-strong-sign-in). Better Auth's sessions do not say how they began, so the server notes it: each passkey sign-in (`/passkey/verify-authentication`), and each correct second step (`/two-factor/verify-totp`, `verify-otp` and `verify-backup-code`), whether it finishes a sign-in or confirms the session the browser has, stores the time beside the session, in the `verification` table, until the session expires. It needs no migration. Staff sessions are never noted.

The app's authenticator gives a token of the person's own session `signIn.strongAt()`, which reads that time when a request needs it, so other requests do no extra lookup. An app with its own authenticator (`auth/authenticate.ts`) sets `signIn: { staff: false, strongAt }` on the sessions it returns, `strongAt` resolving to a `Date` or `undefined`; without it, such values are refused.

Confirming it's them later counts from then: a passkey signs the browser in anew, and a code from the authenticator app, a backup code, or the emailed code of an account whose second step is email (`/two-factor/send-otp`, then `verify-otp`), confirms the session it has. `createAuthSession` from `@protobase/client` does both, with `signInWithPasskey()` and `verifyTwoFactor({ method: 'totp', code })`.

### Emailed confirmation code

An account with neither a passkey nor a second step has nothing stronger to confirm with, so when the app has mail it confirms with a code emailed on request instead, and the record page and the account page offer it in place: "Email me a code", then the code from the email. `POST /api/auth/account/confirmation-code/send` emails a new code to the signed-in person, and `POST /api/auth/account/confirmation-code/verify` with `{ code }` checks it and notes the strong sign-in for that session, as a second step does. The client has them as `session.account.sendConfirmationCode()` and `confirmWithCode(code)`.

- It is a code of its own kind: it never signs anyone in, and a sign-in code never confirms.
- It works only in the session that asked for it, of the user that asked, and only through the session cookie: an [MCP client](#oauth-for-mcp-clients) or an app's token cannot ask for one or use it. A [staff session](#staff-sign-in) cannot either (`STAFF_CANNOT_CHANGE_SIGN_IN`).
- It works for 10 minutes and once. A new one ends the one before, and three wrong codes end it (`TOO_MANY_ATTEMPTS`); asking and checking are each limited to 5 a minute and client.
- When the email cannot be sent, the request fails and no code works.
- An account with a passkey or a second step is refused (`403 CONFIRMATION_CODE_NOT_OFFERED`) and keeps confirming with those.

### Confirming an account change

Better Auth's own check of a fresh session, which could only be met by signing out and in again, is off (`freshAge: 0`). In its place, a session that signed in more than a day ago confirms it's them in place, as above, before a change that needs it, else the change is `403 STRONG_SIGN_IN_REQUIRED`; the confirmation counts for 15 minutes:

- adding a passkey;
- turning on [two-factor authentication](#two-factor-authentication), reading its authenticator link or making new backup codes, on an account without a password (an account with a password gives it instead);
- unlinking a sign-in provider (`/unlink-account`);
- making a [personal access token](/reference/personal-access-tokens/#making-one);
- [deleting the account](#deleting-the-account) without a password.

An account with neither a passkey nor a second step has no strong sign-in to confirm with but an [emailed code](#emailed-confirmation-code), so for its first passkey it may give its password instead, where the account page asks: `POST /api/auth/account/confirm-password` with `{ password }`, `session.account.confirmWithPassword(password)` in the client. It counts for adding that passkey only, within 15 minutes, and is no strong sign-in: a [strong sign-in field](/reference/data-config/#recent-strong-sign-in) still asks for one. A wrong password is `INVALID_PASSWORD`, and every try counts toward the account's [password checks](#name-password-and-devices); an account with a passkey or a second step is refused (`403 PASSWORD_CONFIRMATION_NOT_OFFERED`), and so is a [staff session](#staff-sign-in).

Listing the account's devices (`/list-sessions`) needs no confirmation.

## Sign-in policy

Admins set how people sign in on the app's **Sign-in policy** page (the profile menu, under the user). Each method takes a rule:

| Method | Rules | Default |
| --- | --- | --- |
| Password | On, Off | On |
| Emailed sign-in code | On, Off | On |
| Passkeys | Optional, Required, Off | Optional |
| Two-factor authentication | Optional, Required, Off | Optional |
| Staff sign-in as a person | On, Email the person, Off | On |
| Sign in with ... through the platform | On, Off | On |

The Default column is the policy of an app that sets none. An app sets its own in the config, the policy that applies until an admin saves one, such as emailed codes and passkeys only, with the methods it changes:

```ts
auth: { signInPolicy: { password: 'forbidden' } }
```

It is checked at startup as an admin's save is, so a default that would lock people out stops the app; without mail it applies as a saved policy does (password sign-in is then on). The page shows it, as never changed, until an admin saves a policy. Pair it with `protobase users create --no-password`, so the first admin has no password to fall back on.

The server stores the policy in the `sign_in_policy` table, one row per save (the newest applies, the others are its history, with who saved each and when; a newest row that no longer reads, with a rule the method does not take, counts as none, so the app's default applies), and applies it to Better Auth's endpoints; the pages only show what it allows.

- **Off:** the server refuses the method with `403` (`SIGN_IN_METHOD_FORBIDDEN`) and the sign-in page leaves it out. Passkeys off also stops adding them; two-factor off stops turning it on, while those who have it keep being asked until they turn it off.
- **Required:** someone who signs in without it is sent to set it up first. The server holds back API tokens until then (`GET /api/auth/token` answers `403`, `SIGN_IN_SETUP_REQUIRED`), and refuses to turn two-factor authentication off or to remove the last passkey.
- Signed-in people keep their session after a change; a newly required method is asked for at their next token refresh, within 15 minutes.
- **Staff sign-in as a person** shows only with an [operator provider](#operator-provider). Off refuses [staff sign-in](#staff-sign-in) (`403`, `SIGN_IN_METHOD_FORBIDDEN`); Email the person mails the person each time, and needs mail: without it the server refuses to save it, and a saved one turns staff sign-in off until mail is back.
- **Sign in with ... through the platform** shows only with [platform sign-in providers](#platform-sign-in-providers), and names them all. Off refuses starting, finishing and connecting every one of them, and their [token sign-in](#token-sign-in) (`403`, `SIGN_IN_METHOD_FORBIDDEN`), and the sign-in page leaves it out. It applies as Off while passkeys are Required, as it signs in without one. While two-factor authentication is Required it stays on: the [second step](#two-factor-authentication) follows it, and someone who has none yet sets it up first.

The server refuses a policy (`400`, `SIGN_IN_POLICY_REFUSED`, with the reason) that would lock people out: passwords and emailed codes both off (someone without a passkey could not sign in), passwords off without mail, two-factor authentication required with passwords off (turning it on asks for the password), or a policy the saving admin could not sign in with. Emailed codes need mail: without `PROTOBASE_SMTP_URL` they are off whatever the policy says, and so that a policy saved with mail cannot lock everyone out once mail goes away, password sign-in is then on as well.

The endpoints, for admins: `GET /api/auth/policy/sign-in` answers `{ policy, effective, mail, operator?, platformProviders?, savedAt?, savedBy? }` (`effective` is the policy as it applies now, `operator` the operator provider's name, `platformProviders` the names of the platform's sign-in providers), and `POST /api/auth/policy/sign-in` with `{ password, emailCode, passkey, twoFactor, staffAccess, platformSignIn }` saves one. `GET /api/auth/account/sign-in-methods` tells the signed-in user the policy, what their account has (`password`, `passkeys`, `twoFactor`, `authenticatorApp`) and what it still has to set up (`missing`).

Sign-in providers the project configures in code, such as its own GitHub app, are not covered by the policy; those the platform adds are. Neither are roles: the policy is the same for everyone.

## Staff sign-in

The team that runs an app (the operator: Protobase Cloud, or whoever hosts it) can sign in as one of its people to help them, without their password and without the app's keys leaving the app. Staff sign in with the operator's own identity provider, and the app trusts that provider for this alone: it never creates an account for them.

1. Staff open the app with `?staff-sign-in`, for example `https://admin.example.com/?staff-sign-in&email=sanne@example.com&reason=Ticket+4211`, from a support tool or by hand. The page asks for the person's address and a reason, at least 10 characters.
2. "Continue with ..." sends them to the operator provider, where they sign in.
3. The provider sends them back to the app, signed in as the person, with a banner across the top: who is signed in as whom, why, until when, and "Stop staff session". A refusal comes back to the same page with the reason.

The guardrails:

- **Permission:** the ID token's `groups` claim must hold the configured group (default `protobase-staff-access`).
- **A strong, recent sign-in:** the provider must report a passkey or a second step (`amr` with `mfa`, `hwk` or `swk`, or an `acr` from `acrValues`), at most 15 minutes old (`auth_time`; the app asks with `max_age`). The person's own two-factor and passkey requirements do not apply to staff.
- **A reason**, kept in the log with who signed in as whom.
- **Short and stoppable:** the session lasts 30 minutes (`sessionMinutes`, at most 240), is never extended, ends with the browser, and "Stop staff session" (`POST /api/auth/staff/stop`) ends it and signs the browser out. An API token it got before stops working on its next request, like that of any [ended session](#when-a-token-stops-working).
- **No takeover:** a staff session cannot change the person's password, email, passkeys, two-factor authentication, sessions or personal access tokens, nor save the sign-in policy (`403`, `STAFF_CANNOT_CHANGE_SIGN_IN`).
- **The app decides:** admins turn staff sign-in off, or have the person emailed each time, with the [sign-in policy](#sign-in-policy).
- **One way in:** Better Auth's own `/admin/impersonate-user` and `/admin/stop-impersonating` are off (`404`), so app admins cannot sign in as their people.
- The start is limited to 5 per minute and client; only the browser that started a sign-in can finish it, within 10 minutes and once; and the page it comes back to must be on a trusted origin.

Admins find the log under the policy on the **Sign-in policy** page: each staff sign-in with the staff member, the person, the reason, and when it started and ended. It is the `staff_sign_in` table, and `GET /api/auth/staff/sign-ins` (admins) answers `{ signIns }`, newest first. A staff session is a session of Better Auth's admin plugin with `impersonatedBy` set to the staff member's address; `GET /api/auth/staff/session` answers `{ staff }` for it (`null` otherwise), which the banner shows.

### Operator provider

Any OpenID Connect provider works. Register the app with it as a confidential client:

- Redirect URI: `<url>/api/auth/staff/callback`, and `<origin>/api/auth/staff/callback` for each of the app's [other origins](#several-origins): staff come back to the one they started on.
- The client authenticates with its secret (`client_secret_basic`) and PKCE (`S256`); scopes `openid email profile`.
- The ID token carries `groups`, `amr` (or `acr`) and `auth_time`, signed with a key the provider publishes in its JWKS.

On a platform, pass it in the environment:

```sh
PROTOBASE_OPERATOR_ISSUER=https://id.operator.example     # its discovery is <issuer>/.well-known/openid-configuration
PROTOBASE_OPERATOR_CLIENT_ID=admin-example-com
PROTOBASE_OPERATOR_CLIENT_SECRET=...
PROTOBASE_OPERATOR_NAME="Protobase Cloud"                  # shown as "Continue with Protobase Cloud"; default "the operator"
PROTOBASE_OPERATOR_GROUP=protobase-staff-access            # the default
```

Set the first three together or none: some but not all of them stops the app at start with an error. The one exception is [token sign-in alone](#token-sign-in): `PROTOBASE_SIGN_IN_ISSUER` with `PROTOBASE_SIGN_IN_TOKENS=true`, and no secret. In the config, `auth.operator` takes the same settings and a few more, and `false` turns staff sign-in off whatever the environment says:

```ts
auth: { operator: { issuer, clientId, clientSecret, name: 'Support', group: 'support-leads', scopes: ['groups'], acrValues: ['gold'], sessionMinutes: 15 } }
auth: { operator: false }
```

`scopes` adds scopes for a provider that puts `groups` in the ID token only for a scope of its own (Okta's `groups`, for example), and `acrValues` names the levels that count as a strong sign-in for a provider that reports `acr` instead of `amr` (Keycloak's levels of assurance, for example); the app then asks for them with `acr_values`. `GET /api/auth/status` names the provider as `staffSignIn` while staff can sign in.

## Sign-in with GitHub

Projects have no sign-in provider of their own by default (a platform can add [one](#platform-sign-in-providers)). `auth.socialProviders` adds Better Auth's [social providers](https://www.better-auth.com/docs/authentication/github), and the sign-in page shows "Continue with {name}" for each, such as "Continue with GitHub" with GitHub's mark for `github`:

```ts
export default defineConfig(({ env }) => ({
  auth: { socialProviders: { github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! } } },
}))
```

- The callback URL to register with GitHub is `<url>/api/auth/callback/github`, and the same path on each of the app's [other origins](#several-origins) it should sign in on. A GitHub OAuth App takes one callback URL, so it covers one origin; a GitHub App takes several. A GitHub App needs the Email addresses (read-only) account permission, or sign-in fails with `email_not_found`.
- A provider is also a public sign-up: someone without an account gets one with the [default role](#roles). Without a default role the sign-up is refused.
- `GET /api/auth/status` lists the provider ids as `socialProviders`.
- `encryptOAuthTokens: true` stores the provider's access and refresh tokens encrypted with the secret. <gap>`encryptOAuthTokens` cannot protect the provider's ID token, which is stored as the provider gave it, because encrypting or dropping it is not implemented.</gap>
- The provider's tokens stay on the server: Better Auth's `/api/auth/get-access-token` and `/api/auth/refresh-token`, which would answer the browser with them, are turned off.
- The `onUserCreated` [hook](#hooks) runs after any user is created, a social sign-up included (Better Auth's `databaseHooks.user.create.after`).

### Sign-in links and connected accounts

These work for every provider, the project's own and the [platform's](#platform-sign-in-providers):

- **Sign-in links:** `https://<app>/?sign-in=github` starts signing in with `github` at once, showing only "Signing in with GitHub" while the browser leaves, so someone the provider knows lands signed in without a sign-in page. A refusal comes back to the sign-in page with the reason (`?error=<code>`, for example `signup_disabled`), and does not start again. Someone signed in already just opens the app.
- **Connected accounts:** the [account page](#account-page)'s **Sign-in & security** tab lists the providers and offers "Connect GitHub" for one the account is not linked to. Connecting signs in at the provider and links that account whatever its address (`accountLinking.allowDifferentEmails`, which applies only to this explicit link by someone signed in). A provider account linked to another person already is refused (`account_already_linked_to_different_user`); a [staff session](#staff-sign-in) cannot link.
- **Linked up front:** `protobase users create <email> --github-id <id>`, or `createUser(auth, { ..., accounts: [{ providerId: 'github', accountId }] })`, links a new user to a GitHub user id, so GitHub finds them by it whatever address it reports.
- Without a link, a provider finds someone by address only when it vouches for the address (`email_verified`) and the account's address is verified; accounts created by an admin or on the host are.
- **Through the provider's pages only:** signing in or connecting with an ID token a client posts instead (`idToken` on `/api/auth/sign-in/social` or `/api/auth/link-social`, as `signIn.social({ provider, idToken })` of Better Auth's client sends it) is refused with `403 TOKEN_SIGN_IN_OFF`, for every provider: such a token would sign in without the nonce of a sign-in the app started, as often as it is posted, and without the app's [second step](#two-factor-authentication). The one exception is signing in with the platform's provider when its [token sign-in](#token-sign-in) is on, with the limits that section lists.

## Sign-in with SAML

`auth.sso.saml` adds the app's SAML 2.0 identity providers, such as Okta, Entra ID or Google Workspace, through Better Auth's [SSO plugin](https://www.better-auth.com/docs/plugins/sso). The sign-in page shows "Continue with {name}" for each:

```ts
import { readFileSync } from 'node:fs'

export default defineConfig({
  auth: { sso: { saml: [{ id: 'okta', name: 'Okta', domains: ['example.com'], idp: { metadata: readFileSync('auth/okta-metadata.xml', 'utf8') } }] } },
})
```

Instead of the metadata XML, `idp` takes the provider's entity ID, sign-in URL and signing certificate: `{ entityId, ssoUrl, certificate }`, where `certificate` is a PEM, or a list of them while one rotates. The id is lowercase letters, digits or `-`, and differs from those of the other sign-in providers; `name` defaults to `SSO`.

- **What the provider's admin needs:** the entity ID and metadata URL `<url>/api/auth/sso/saml2/sp/metadata?providerId=okta`, which most providers import, and the ACS URL `<origin>/api/auth/sso/saml2/sp/acs/okta` for each of the app's [origins](#several-origins). The assertion carries the address as attribute `email` (or the NameID), and the name as `givenName` and `surname` or as `displayName`; `attributes: { email, name, firstName, lastName }` names other attributes. The NameID identifies the account, so a stable one is best: persistent, or the address.
- **Who gets in:** someone at one of `domains` (subdomains count) signs in to the account with that address, linked on the first sign-in, or gets a new one with the [default role](#roles), as with GitHub; without a default role the sign-up is refused. An address outside `domains` is refused, whether or not an account has it (`EMAIL_DOMAIN_NOT_ALLOWED`, or `account_not_linked` for an existing account). With [organizations](#organizations), people still join one by invitation.
- **Sign-in links** work as for the other providers: `https://<app>/?sign-in=okta` starts it at once. A SAML provider links an account by signing in, so the account page does not offer to connect it.
- `GET /api/auth/status` lists the providers as `samlProviders: [{ id, name }]`. Like `socialProviders`, they have no row in the [sign-in policy](#sign-in-policy), and a required passkey or two-factor authentication still holds back the token until it is set up.
- **No migration:** the providers live in config, so the store gets no table for them.
- The plugin's defaults stay: the response must answer a request this app made, within 5 minutes of clock skew, once. Not supported yet:
  - <gap>SAML sign-in does not support SCIM yet.</gap>
  - <gap>SAML sign-in does not support single logout yet.</gap>
  - <gap>SAML sign-in cannot be started at the provider yet.</gap>
  - <gap>SAML providers cannot be kept per organization yet.</gap>
  - <gap>SAML sign-in does not support signed or encrypted requests yet.</gap>

## Platform sign-in providers

A platform that hosts the app can add sign-in providers for the people who have an account in it: any OpenID Connect providers, passed in the environment, each with an id of its own. A list of one is the common case. Protobase Cloud passes its own, so people sign in with GitHub through the Protobase GitHub App; a self-hosted app passes [Dex, Keycloak](#self-hosting-with-dex-or-keycloak) or the like.

```sh
PROTOBASE_SIGN_IN_ISSUER=https://auth.example.com     # its discovery is <issuer>/.well-known/openid-configuration
PROTOBASE_SIGN_IN_CLIENT_ID=erp-example-com
PROTOBASE_SIGN_IN_CLIENT_SECRET=...
PROTOBASE_SIGN_IN_PROVIDER=oidc                       # the default; the button, the callback and the namespace of the links
PROTOBASE_SIGN_IN_NAME="Acme SSO"                      # shown as "Continue with Acme SSO"; default GitHub for github, SSO otherwise
```

Register the app with the provider as a confidential client with the redirect URI `<url>/api/auth/callback/<provider>` (`/api/auth/callback/oidc` by default), and the same path on each of the app's [other origins](#several-origins). The app authenticates with its secret (`client_secret_basic`) and PKCE (`S256`), asks for `openid email profile`, and takes the person from the ID token only, verified against the provider's JWKS, the issuer, the client and the nonce. The provider needs no userinfo endpoint.

- **No sign-up:** someone without an account is refused (`signup_disabled`); admins add people as before. A provider the project did not choose never opens the app to new people.
- **The project's own provider wins:** with `socialProviders.github` in code and `PROTOBASE_SIGN_IN_PROVIDER=github`, the project's GitHub app handles the sign-in and the platform's is left out.
- **The provider id:** set `PROTOBASE_SIGN_IN_PROVIDER=github` only when the provider's `sub` is the GitHub user id, as Protobase Cloud's is. Its links are then those of Better Auth's own GitHub provider, so an app that later brings its own GitHub app keeps every person's link. Dex's and Keycloak's `sub` is their own id, so keep the default `oidc` for them.
- **Startup:** the provider's settings are read when the app starts; when they cannot be, the provider is left out until the next start (the status and sign-in page do not offer it) and every other way to sign in works.
- **Linking by address, safely:** a provider's first sign-in for someone links their account only when the token says the provider verified the address (`email_verified: true`) and the account's own address is verified. Once linked, the link alone finds them: the provider's id and `sub`, whatever address the token carries later. A person linked to one subject of a provider is not linked to a second one by address (`403 PROVIDER_ACCOUNT_LINKED`), unless the provider signs in [devices](#device-accounts). The store holds each provider's account once, and for a provider that links one subject per person, one account per person (unique indexes on the provider and account id, and on the provider and person, the `auth` module's step 2), so two first sign-ins at the same moment link one, whether they bring the same subject or two.
- The [sign-in policy](#sign-in-policy) has one row for every one of them, and `GET /api/auth/status` names those with a button as `platformProviders: [{ provider, name }]` besides listing them in `socialProviders`, and those that take [token sign-in](#token-sign-in), by token alone too, as `tokenProviders: [provider]`, so a client such as a phone app knows before it posts an ID token whether the app takes it, and through which provider.

Set the first three together or none: some but not all of them stops the app at start with an error. In the config, `auth.signInProviders` takes a list of the same settings with `scopes`, `tokenSignIn`, `authorizationParams`, `hidden`, `button` and `devices`, and `[]` turns them off whatever the environment says:

```ts
auth: { signInProviders: [{ issuer, clientId, clientSecret, provider: 'oidc', name: 'Acme SSO', scopes: ['groups'] }] }
auth: { signInProviders: [] }
```

### More than one provider

Each further provider takes the same variables with its id after `PROTOBASE_SIGN_IN_`, in upper case with `_` for `-`: `PROTOBASE_SIGN_IN_PHONE_ISSUER`, `PROTOBASE_SIGN_IN_PHONE_CLIENT_ID` and so on for the provider `phone`, `PROTOBASE_SIGN_IN_ACME_SSO_ISSUER` for `acme-sso`. The name gives the id, so such a provider takes no `_PROVIDER`, and adding or removing one leaves the others as they are. The unnamed variables stay one provider of their own, so an app with one provider is configured as before, and the named ones need not have it. Every provider is checked on its own: a token posted under a provider's id is verified against that provider's issuer, keys and client id alone, and a [token sign-in](#token-sign-in) is kept as used by its issuer.

```sh
PROTOBASE_SIGN_IN_ISSUER=https://auth.example.com
PROTOBASE_SIGN_IN_CLIENT_ID=erp-example-com
PROTOBASE_SIGN_IN_CLIENT_SECRET=...
PROTOBASE_SIGN_IN_PROVIDER=github
PROTOBASE_SIGN_IN_PHONE_ISSUER=https://id.example.com         # the provider phone, for token sign-in alone
PROTOBASE_SIGN_IN_PHONE_TOKENS=true
```

- **Ids:** each provider has an id of its own; two with one id stop the app at start, such as `PROTOBASE_SIGN_IN_PROVIDER=phone` next to `PROTOBASE_SIGN_IN_PHONE_ISSUER`. So does a named set without its `_ISSUER`, a name that is no provider id, such as the numbered `PROTOBASE_SIGN_IN_2_ISSUER` of earlier versions, or a named `_PROVIDER`.
- **Order:** the unnamed provider comes first, then the named ones in order of their id.
- **Names:** `name` (`PROTOBASE_SIGN_IN_NAME`, `PROTOBASE_SIGN_IN_PHONE_NAME`) is what people see, apart from the id, so two providers may show the same name.
- **Fixed authorization parameters:** `PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS` (`authorizationParams` in the config), written as `name=value&other=value`, goes on every authorization request to that provider as given, such as a parameter naming which of its own sign-in methods it must use. A client cannot change or add to them: a sign-in or link with a platform provider that brings `additionalParams` of its own answers `400 AUTHORIZATION_PARAMS_FIXED`. The parameters the sign-in sets itself (`state`, `client_id`, `redirect_uri`, `response_type`, `scope`, `nonce`, `code_challenge`, `code_challenge_method`) cannot be fixed; naming one stops the app at start.
- **No button:** `PROTOBASE_SIGN_IN_BUTTON=false` (`button: false`) keeps "Continue with {name}" off the sign-in page for a provider with pages. People still sign in through its pages when something sends them there: a [sign-in link](#sign-in-links-and-connected-accounts) (`?sign-in=<provider>`), or a redirect another app starts. `GET /api/auth/status` still lists it in `socialProviders`, so links work, and marks it `button: false` in `platformProviders`. A provider of [token sign-in](#token-sign-in) alone has no button anyway, and naming one stops the app at start. The account page's connected accounts follow `hidden`, not this.
- **Kept off the account page:** `PROTOBASE_SIGN_IN_HIDDEN=true` (`hidden: true`) keeps people's links to that provider off the account page: the connected accounts do not list it, `/api/auth/list-accounts` leaves its links out, and connecting it, or disconnecting one of its links by its id, answers `403 PROVIDER_ACCOUNT_HIDDEN`. The link still signs in, and goes when the person is deleted. `GET /api/auth/status` marks it `hidden: true` in `platformProviders`.

### Device accounts

A provider that gives each device a subject of its own, such as one that signs in a phone app, can have every device be an account of its own: `PROTOBASE_SIGN_IN_DEVICES=true` (`devices: true`), with [token sign-in](#token-sign-in) alone, without a client secret.

Device sign-in keeps its own tables, `refused_account` and `device_session`, which a migration makes. A provider of `auth.signInProviders` with `devices: true` turns them on. For the platform's providers from the environment, turn on `auth.signInDevices` in the config, then write the migration with `protobase migration` and apply it:

```ts
auth: { signInDevices: true }
```

Without it, a provider of the environment with `PROTOBASE_SIGN_IN_DEVICES=true`, or `PROTOBASE_SIGN_IN_<ID>_DEVICES=true`, stops the server at startup with an error naming `auth.signInDevices`.

- **Linked by address:** a device's first sign-in links it to the account with the address the provider vouches for, as for any provider, both addresses verified. A person holds as many of the provider's accounts as they have devices.
- **Its sessions:** each session a device's token sign-in starts is kept as the device's in the store's `device_session` table (the `platform_devices` module's step 1), which goes with the session, so it lasts as long as the session however often it is renewed. A sign-in that waits for the [second step](#two-factor-authentication) is the device's once the step is taken.
- **On the account page:** the **Devices** tab lists each device as the provider's name with the device's own name, which the device's ID token carries in the `device_name` claim (a string), with when it was linked, and the sessions it began under it rather than among the others. The connected accounts do not list them. `GET /api/auth/account/device-links` answers `{ links: [{ id, provider, name, device, linkedAt, sessions }] }`, `sessions` being the tokens of the sessions it began; `GET /api/auth/status` says `deviceLinks: true`.
- **Sign out:** **Sign out** on a device, `POST /api/auth/account/device-links/sign-out` with its `id`, refuses its subject from then on, ends every session it began, however many, in one statement in the store, and removes its link, in that order: a token for it answers `403 DEVICE_SIGNED_OUT` and never links again, by address or otherwise, and a sign-in with it that was under way ends its own session. A sign-out that stopped half way is taken again with the same `id`. The person's other devices stay signed in, and a new device of the same address links as the first ones did. The refused subjects are kept in the store's `refused_account` table (the `platform_devices` module's step 1), and go when the person is deleted. A [staff session](#staff-sign-in) can do neither.


### Token sign-in

A client that already holds a fresh ID token the platform's provider issued for this app, such as a phone app the person signed in to once at the provider, can post it to the app instead of sending a browser through the provider's pages. It gets the app's own session, as an emailed code or the provider's pages would give it. The provider's token counts as one factor, in the place of an emailed code: the app asks for its own second step when the person turned one on, and nothing else. Off by default:

```sh
PROTOBASE_SIGN_IN_TOKENS=true        # true or false; anything else stops the app at start
```

```ts
auth: { signInProviders: [{ issuer, clientId, clientSecret, tokenSignIn: true }] }
```

The client posts `POST /api/auth/sign-in/social` with `{ "provider": "<provider id>", "idToken": { "token": "<ID token>" } }`, as Better Auth's client sends `signIn.social({ provider, idToken: { token } })`, and gets the session cookie with `{ redirect: false, user }`, or `{ twoFactorRedirect: true, twoFactorMethods }` when the [second step](#two-factor-authentication) is due, which it finishes as after a password. Then `GET /api/auth/token` gives it the app's API token as for any session.

- **Only this app's own providers:** the app trusts the providers it is configured with, each for its own tokens, and a token only for this app. The token must be signed with a key the provider it is posted for publishes (its discovery's `jwks_uri`) with an asymmetric algorithm, come from that provider's issuer, and have this app's client id as its one audience, so a token issued for another app is never accepted here. It must carry an `email` (a `jti` is not needed), live at most 5 minutes from `iat` to `exp`, and have been issued within the last 5 minutes (30 seconds of clock skew allowed). Otherwise it is refused with `401 INVALID_TOKEN`.
- **Alone, without a client secret:** with the issuer and `PROTOBASE_SIGN_IN_TOKENS=true` but no `PROTOBASE_SIGN_IN_CLIENT_SECRET` (`signInProviders: [{ issuer, tokenSignIn: true }]`), the app is no client of the provider's: it takes tokens whose audience is the origin of its `url`, or `PROTOBASE_SIGN_IN_CLIENT_ID` when set, as from the [token exchange](#token-exchange) of an OpenID provider's `audiences`. Nobody is sent through the provider's pages: the sign-in page shows no button for it, and starting or connecting it answers `403 PROVIDER_PAGES_OFF`.
- **Once:** each token signs in once. Its issuer and the SHA-256 of its claims are kept in the `verification` table until it expires, with no migration, and a second use answers `401 TOKEN_USED`. The claims count, not the token's text, so the same token written another way is refused too, and so is a second token with exactly the same claims.
- **Who it signs in:** as through the provider's pages, the account linked to the provider's `sub`, else the account with the address the provider vouches for (`email_verified`), which it links [safely](#platform-sign-in-providers). Nobody is signed up (`401`), and a banned person is refused.
- **Never recent:** the client can mint a fresh session at will, so a session a token began never counts as [recently signed in](#confirming-an-account-change). Adding a passkey, unlinking a provider, making a personal access token or deleting the account asks it to confirm it's them in place first, and it is never a [strong sign-in](#recent-strong-sign-in) until it confirms it's them.
- **The policy:** **Sign in with ... through the platform** in the [sign-in policy](#sign-in-policy) covers it, so Off refuses it, and so do passkeys being Required. Linking a provider with a token stays refused (`403 TOKEN_SIGN_IN_OFF`).
- **Rate limit:** `/api/auth/sign-in/social` takes `signInPerMinute` requests a minute per client, default 5, as a password sign-in does.
- **Signing out:** signing out at the provider ends no session in the app, as with the provider's pages; the app's own sign-out, an admin, a ban or a deletion does.

### Self-hosting with Dex or Keycloak

[Dex](https://dexidp.io) with its GitHub connector signs people in with GitHub through one GitHub OAuth app for every app, the way Protobase Cloud does:

```yaml
issuer: https://dex.example.com
connectors:
  - type: github
    id: github
    name: GitHub
    config: { clientID: $GITHUB_CLIENT_ID, clientSecret: $GITHUB_CLIENT_SECRET, redirectURI: https://dex.example.com/callback }
staticClients:
  - id: erp-example-com
    secret: $ERP_CLIENT_SECRET
    name: ERP
    redirectURIs: ['https://erp.example.com/api/auth/callback/oidc']
```

```sh
PROTOBASE_SIGN_IN_ISSUER=https://dex.example.com PROTOBASE_SIGN_IN_CLIENT_ID=erp-example-com PROTOBASE_SIGN_IN_CLIENT_SECRET=$ERP_CLIENT_SECRET PROTOBASE_SIGN_IN_NAME=GitHub
```

[Keycloak](https://www.keycloak.org): in a realm, add GitHub (or any other provider) under **Identity providers**, with **Trust email** on so Keycloak vouches for the GitHub address. Create a client with **Client authentication** on, the **Standard flow** and the valid redirect URI `https://erp.example.com/api/auth/callback/oidc`, and take its secret from **Credentials**:

```sh
PROTOBASE_SIGN_IN_ISSUER=https://keycloak.example.com/realms/acme PROTOBASE_SIGN_IN_CLIENT_ID=erp PROTOBASE_SIGN_IN_CLIENT_SECRET=... PROTOBASE_SIGN_IN_NAME="Acme SSO"
```

People sign in with the address their account here has, or connect the provider on the account page's Sign-in & security tab once.

## Roles

The roles are a project setting: `auth: { roles: ['admin', 'auditor', 'sales', 'accountant'] }`. `admin` is always included and first; the default is `['admin', 'user']`. Names are lowercase letters, digits, `_` and `-`. `defaultRole` is what a new user gets when no role is given. Without it, and with more than one role besides `admin`, creating a user without a role is an error that lists the choices (the CLI then needs `--role`); with exactly one other role, that role is the default. `auth.defaultRole` is `undefined` when a role must be chosen. A user can hold several roles (`setUserRole(auth, { email, role: 'sales,accountant' })`), and acts with one of them at a time, the [active role](#active-role).

`createUser`, `setUserRole` and Better Auth's own admin endpoints refuse a role outside the list. `roleChoices(auth)` returns the list, for the CLI's `users set-role` and for UIs. Only `admin` gains Better Auth admin-plugin permissions (managing users); every other role is for your access rules, which see them as `ctx.user.roles`. Besides `admin`, the role `ai` opens the [assistant](/reference/assistant/#who-sees-it) when the project lists it.

### Active role

A session acts with one role, as it works in one [organization](#organizations): its token carries that role alone, so the API, `/meta` and with it the views, the sidebar and what the app offers follow it, as do the admin-only endpoints (the sign-in policy, the log of staff sign-ins, Better Auth's user management). A new session starts with the role the person last chose, else their first. `POST /api/auth/role/switch` with `{ role }`, one the person holds, moves the session to it; the next token carries it, without signing in again, and the user keeps it (`user.last_role`) for their next session. `GET /api/auth/role/current` answers `{ active, roles }`, the active role and the roles held, each with its label, where the session works. Someone holding one role has nothing to switch.

The app offers the roles in the profile menu, below the organizations, for someone holding more than one. The client has them as `session.roles` (`current`, `switchTo`). With organizations, the roles held are the global ones and those of the membership in the organization the session works in; a role not held there leaves the session with the person's first role there. Managing organizations (creating, entering, inviting and giving app roles) follows every role held. The session keeps its role in `session.active_role`; every store has both columns (see [migrations](#migrations)).

## Organizations

Off by default: without `organizations`, an app is one organization, as above. Turned on, people work in one organization at a time, `.tenant` resources show only its rows, and the organization comes from the signed-in person instead of `authenticate.tenant`:

```ts
auth: {
  roles: {
    admin: 'Superuser',
    manager: { label: 'Manager', grants: ['sales', 'accountant'] },
    sales: 'Sales',
    accountant: 'Accountant',
  },
  organizations: { enabled: true, default: { id: 'main', name: 'Main', slug: 'main' }, existingUsersRole: 'sales', create: 'everyone' },
}
```

It is Better Auth's organization plugin, with its tables named in snake_case (`organization`, `member`, `invitation`, `session.active_organization_id`, `user.last_organization_id`), which the store has while organizations are on, and keeps once they are turned off (see [migrations](#migrations)).

**Two kinds of role.** Every membership has an organization role, Better Auth's `owner`, `admin` or `member`, which decides who manages the organization: owners and admins invite, remove and change members and edit its details; only owners hand it over, delete it or make owners. App roles, the project's `roles`, decide what the app shows and allows. A user holds them **globally** (the admin plugin's `role` column, as without organizations), which applies in every organization, or **per membership** (`member.app_roles`), which applies there only. A request's role, `ctx.user.roles`, is the session's [active role](#active-role), of either kind; access rules see the organization role as `ctx.organization.role`, read from the membership on each request, absent for someone who is no member there, such as a superuser who entered it. `admin` is the superuser: global only, it holds every role. With organizations every role needs a label; `owner` and `member` cannot be app role names, and `user` stands for an account without a global role.

**Who gives which role.** Someone may give or take away a member's app role only if they hold it, in that organization or globally, or hold a role whose `grants` list it (`manager` above gives `accountant` without holding it); grants do not chain, and a superuser may give any. Only a superuser changes global roles. The creator of an organization becomes its owner with every app role (`creatorAppRoles`, default `'all'`), so they can give them on; for a role added later, list it in a role owners hold, or run `protobase organizations add-app-role <role> --to owners`.

**The organization in the token.** A new session starts in the organization the person last worked in, else their oldest membership. `/api/auth/token` adds `org` (the organization), `org_role` and `app_roles` (the membership's, narrowed to the active role), read when the token is issued; a removed member's token, or one carrying an app role taken away, [stops working](#when-a-token-stops-working) on its next request. The app's authenticator makes `org` the tenant and `ctx.organization.id`, and adds `app_roles` to the global roles. `POST /api/auth/organization/switch` with `{ organizationId }` moves the session; the next token names the new organization, without signing in again. Someone with a global role may switch into any organization, without being a member, and sees there what those roles allow; each such entry is an `organization.entered` [audit event](/reference/api/#audit-events). `GET /api/auth/organization/search?query=&offset=` lists every organization for them, ordered by slug, 20 at a time with the `total`, narrowed by text in the name or slug; the Organizations page shows it as All organizations. A list across every organization stays a resource without `.tenant`, readable by the global role; a list across the organizations someone is a member of is a `.tenant` resource with `across: 'memberships'` (see [Lists across organizations](/reference/access/#lists-across-organizations)).

**Invitations.** Better Auth's `POST /api/auth/organization/invite-member` with `{ organizationId, email, role, appRoles }`; inviting again replaces the earlier invitation, and it works for `invitationDays` (default 7). The email links to `/-/invitation?token=…` on the origin the invitation was made on ([several origins](#several-origins)), or to `invitationUrl`, with a token signed with the app's `secret`, since members can read invitation ids; without a mailer, the answer carries the `link` to pass on. The link page shows `GET /api/auth/invitation?token=`, accepts with `POST /api/auth/invitation/accept` for someone signed in as the invited address, and makes an account with `POST /api/auth/invitation/sign-up` (`{ token, name, password? }`) for an address without one. Someone signed in sees the invitations for their own address with Better Auth's `GET /api/auth/organization/list-user-invitations`, on the organizations page, and accepts one there with `POST /api/auth/invitation/accept-own` (`{ invitationId }`). The link page and its sign-up serve [invitations to the app](#users-page) too. [Open sign-up](#open-sign-up) is not available with organizations: an invitation is the address someone vouched for.

**Members.** Better Auth's `list-members`, `update-member-role`, `remove-member` and `leave`; `POST /api/auth/organization/set-app-roles` (`{ memberId, appRoles }`); `POST /api/auth/organization/transfer-ownership` (`{ memberId, keepAs? }`) makes a member owner and the caller an admin in one step. `GET /api/auth/organization/current` answers the organization a session works in with the caller's roles there. `GET /api/auth/organization/people` answers the members of that organization to any of its members, as `{ people: [{ id, name, image? }] }` with `id` the user id and no email addresses; anyone who is not a member of it, signed out or with a global role only, is refused.

**Deleting** an organization (Better Auth's `delete`, owners only) is refused with `409 ORGANIZATION_HAS_RECORDS` while a `.tenant` resource has rows in it; `deleteRecords: 'cascade'` leaves it to the project's foreign keys. The `beforeOrganizationDeleted` [hook](#hooks) may refuse too.

**Ids.** The `generateOrganizationId` [hook](#hooks) makes a new organization's id, by default a UUID; `.tenant` columns hold it, so `text` or `uuid`. An app whose tenant columns are integers takes the next value of its own organizations sequence instead, and adds its own row in `onOrganizationCreated`, as the ERP example does (`tests/apps/erp/auth/hooks.ts`). An app that ran as one organization keeps its tenant value: `protobase organizations create "Acme" --owner you@example.com --id 1 --members all` makes that organization, with every user in it: superusers as owners, everyone else as a member, their global roles moved onto the membership. The first user `createUser` makes also becomes the owner of every organization without members, such as those a seed made before anyone could own them.

**On the host.** The [`protobase organizations`](/reference/cli/#organizations) commands call these functions of `@protobase/server`, which a script of the project's own, such as a seed, calls with the sign-in of [`loadProjectAuth`](#first-run). The host acts as a superuser, so it may give any role; `organization` is a slug or an id. `scope` is the organization a call works in, by its id, or every organization with `everyOrganization('<why>')` from `@protobase/query`, whose reason says why the call reads every organization's rows:

```ts
import { addAppRoleToOwners, addMember, createOrganization, isMemberByEmail, listOrganizations, listUsers, organizationByKey, removeMember, setMemberRoles } from '@protobase/server'

await createOrganization(auth, { name, slug, owner: email, id? })                     // the owner holds every app role
await addMember(auth, { organization, email, role?, appRoles? })                      // role: owner, admin or member (default)
await setMemberRoles(auth, { organization, email, role?, appRoles? })
await removeMember(auth, { organization, email })                                     // refuses the last owner
await listOrganizations(auth, scope, { after?, size? })                              // a page, oldest first: { organizations: [{ id, name, slug, members }], next? }
await addAppRoleToOwners(auth, scope, appRole)                                        // a role the project added later, to the owners in scope
await listUsers(auth, { scope?, after?, size? })                                     // the members of scope; every user without it
await organizationByKey(auth, organization)                                           // the organization, or null
await isMemberByEmail(auth, organizationId, email)
```

The app's own pages are under the profile menu: the switcher, "Manage organizations" (theirs, a new one, and for global roles any one), "Organization" (details, leaving, handing over, deleting), and for owners and admins "Members" and "Invitations". The client has them as `session.organizations` (`list`, `current`, `switchTo`, `members`, `invite`, ...). `session.organizations.create({ name })` makes one from its name alone: the server makes the slug from the name, and when another organization has that slug, adds a dash and six random letters and digits, such as `acme-k3x9q2`. The organization page changes the slug afterwards.

### The default organization

Every table of the store is either the whole app's or an organization's. `member`, `invitation` and `personal_access_token` hold an organization's rows, each with its `organization_id`; the others, users, sessions, accounts, verifications, two-factor secrets, passkeys, the sign-in policy and the signing keys among them, are the app's. Each index of an organization's table serves one organization, leading with `organization_id`, or the whole app, such as a lookup by a person or an address; a key looked up from outside, such as a token's hash, stays unique across the app. The `db` the app's functions, jobs and hooks get shows them one organization's rows only, unless `db.unscoped('<reason>')` (see [The organization's tables](/guides/api-functions/#the-organizations-tables)). Sign-in's own queries keep to one organization too, work Better Auth finishes after the response included: an `/api/auth/organization/*` request works in the organization it names as `organizationId`, in a GET's query or a POST's body, else in the session's active one, and a POST naming another in its query is refused with `400` (`CONFLICTING_ORGANIZATIONS`); a membership or token is read in the organization it belongs to; and what is a person's own in every organization, such as their organizations, the invitations to their address, their personal access tokens and a token looked up by its hash, is read across them. A request elsewhere in `/api/auth` works in none. <gap>An `/api/auth/organization/*` request that names its organization by slug alone cannot reach one other than the session's active organization because finding the organization of a slug before the request runs is not implemented.</gap> <gap>While organizations are off after being on, the `db` of the app's code cannot keep the tables they leave to the default organization because giving sign-in the default organization while they are off is not implemented.</gap>

The default organization, `organizations.default`, is the one that stands in for every organization while they are off. [`protobase migration`](/reference/cli/#migration) refuses without it once organizations are on or were ever on, and records it in `protobase.snapshot.json`. Turning organizations off sets `enabled: false` and keeps `default`; the store keeps their tables and columns, as [for any module](#turning-a-module-off).

Turning organizations on for the first time makes the default organization under its id, and each user there already becomes its member, with the organization role `member` and the app role `existingUsersRole`; `protobase migration` refuses without that role, unless the store is new and holds no users. Each personal access token made before then works in the default organization: the migration's `.after.sql` fills them in batches, then makes their `organization_id` required, checked first without a long lock, and builds their index per organization concurrently. Turning organizations on again later fills nothing: a token made while they were off was made in the default organization. One made while they were off on an earlier version has no organization, so the migration refuses, naming it, as below. On a store whose organizations were on before, such as one [`migration baseline`](/reference/cli/#migration) started, the default organization is made when the store lacks it, no one becomes its member, and a token without an organization is not given the default one, which would guess where it works: the migration refuses, naming each such token, so you delete them, or set the organization each works in, in a migration of your own written before it. With organizations on, a personal access token is made in the session's active organization, and refused without one.

When organizations are off while the store still holds organizations, as after they were on, the default organization stands in for all of them, and only its members have access:

- At startup, the server refuses to start unless `authenticate.tenant` is the default organization's id, and its error message shows both values. A store with no organization, such as one whose organization tables were made while organizations were off, starts as before.
- A non-member who signs in gets the same answer as for a wrong password, and no session is created. This applies to every sign-in method, including staff sign-in and impersonation.
- Anyone added while organizations are off, by open sign-up, an admin or a sign-in provider, becomes a member of the default organization. They get the organization role `member` and the app role set in `existingUsersRole`, or no app role if that is not set.
- A non-member's session, API token or OAuth access token is refused with `401`. A non-member's session gets no token from `/api/auth/token` and no personal access token, and an admin who is not a member cannot manage people, the sign-in policy or registered clients, so they cannot add someone to the default organization. <gap>A non-member's session from before organizations were turned off still answers `/api/auth/get-session` because refusing it in sign-in's own session read is not implemented.</gap>
- New personal access tokens are created in the default organization, and only tokens created there work. A token created in another organization, or in none, is refused like an unknown token.

When `DATABASE_URL` is set, the question `protobase migration` asks as organizations are turned off says how many people are not members of the default organization. It also says how many personal access tokens were created outside it. If the store's only organization is not the default, `protobase migration` offers to make it the default. If you answer yes, it prints the `default` entry for your config and stops without writing anything. Add the entry and run it again.

### First organization and start address

:::caution[Beta]
The start address is the same for everyone in an app; it does not yet remember where each person was last.
:::

Someone signed in who works in no organization, such as the first person in a new app, sees one screen before anything else, whatever address they opened: at `/-/first-organization`, with the app's mark and no sidebar entries, they name their first organization in one field and press Create. With invitations waiting for their address, the screen lists those first, each with Join, and "Create a new organization instead" leads to the form at `/-/first-organization/new`. Someone who may not create one (`create: 'admins'`) and has no invitation is told to ask for one. The screen names who is signed in, with Sign out, and for someone with a global role links to every organization. While it creates or joins, the button says so, such as "Creating workspace…" or "Joining Acme…"; when the server cannot be reached, the screen says so and the button works again. <gap>A request the server takes but never answers keeps the button busy until the browser gives up because a time limit on sign-in and organization calls is not implemented.</gap> Creating or joining opens the app at its start address. Until they work in one, the shell shows none of the app's resources, on the account pages and the organizations page too.

The word the screens use for an organization is yours: `names` takes it as a view's names are written, and `createDescription` adds a line under the screen's title. The built-in texts around the word come in English and Dutch, on this screen, the organization pages and the profile menu:

```ts
auth: {
  organizations: {
    create: 'everyone',
    names: { singular: 'Workspace', plural: 'Workspaces' },
    createDescription: 'Your team talks here, in channels.',
  },
}
```

The screen then reads "Create your workspace", its field "Workspace name" and its button "Create workspace". <gap>The organization word cannot come in each reader's language because translations of `auth.organizations.names` are not implemented.</gap> `/` opens the record a sidebar entry names with [`nav({ start })`](/reference/sidebar/#start-record), such as a chat's #general channel, found by a filter on an indexed field; without one, or when nothing matches, the first sidebar entry, as before.

## Tokens and roles

Sign in at `POST /api/auth/sign-in/email` (or with a code or passkey), then `GET /api/auth/token` (with the session cookie) returns `{ token }`, an EdDSA JWT valid for 15 minutes, unless the [sign-in policy](#sign-in-policy) requires something the account has not set up; the keys are at `/api/auth/jwks`. Send it as `Authorization: Bearer <token>`. `/token` is the only way to a token in the browser: the `set-auth-jwt` header of Better Auth's JWT plugin is off. No other answer under `/api/auth` carries the session token (Better Auth's `token` and `session.token`, as in a sign-in, `get-session` or `list-sessions`): the session is the httpOnly cookie's alone, so script on the page never holds it.

The app's authenticator, which the config's `authenticate` describes, maps the claims to a session: `sub` is the user id, `roles` come from the `role` claim, the session's [active role](#active-role) of those in the admin plugin's `role` column on the user (a comma separated string; the first user is always `admin`). Access rules see them as `ctx.user.roles`. Without organizations, the tenant is `authenticate.tenant`, never a claim; with them, it is the organization the session works in (`org`, see [organizations](#organizations)). The key set is cached in memory: read once, again every 10 minutes (so removed keys stop being accepted), and again when a token names an unknown `kid` (a rotated key), at most once per 30 seconds however many such tokens arrive (`authenticate: { cache: { refreshMs, minReloadMs } }`). An API that runs apart from the auth server sets `authenticate: { jwksUrl, issuer }`, with `organizations: true` when its tokens carry organizations; that turns its own sign-in off, unless the config sets `auth` too. An authenticator of the app's own, such as `jwtAuthenticator(...)` from `@protobase/server` for the tokens of another system, is the default export of `auth/authenticate.ts`, which replaces the one `authenticate` describes. One made over the app's sign-in, such as one that maps the signed-in account to a user of the app's own, is `overSignIn` from `@protobase/server` as that default export: `export default overSignIn((signIn) => withUsers(signIn))` is given the authenticator `authenticate` describes and returns the app's, which the server, `protobase dev` and `protobase doctor` all use.

`jwtAuthenticator` accepts asymmetric signature algorithms only unless you pass `algorithms` explicitly (the tests do, for HS256), so a token cannot be forged with a public key used as an HMAC secret; Better Auth signs with its own key pair and publishes the public keys at `/api/auth/jwks`. An expired, tampered, wrongly signed or missing token is a `401` problem with `WWW-Authenticate: Bearer`; with an [anonymous role](/reference/access/#anonymous-access), a missing one on the resources API is served as that role instead.

### When a token stops working

With sign-in on, the app's authenticator checks on every request that the token still stands, so these take effect on the next request every route that authenticates sees (the resources API, `/api/meta`, batches, functions, files and new `/live` streams), not when the token expires:

| Change | The token |
| --- | --- |
| A ban (`/admin/ban-user`, `protobase users disable`) | is refused until the ban runs out or is lifted; a ban ends the sessions too, so a new token takes signing in again. |
| A role taken away (`/admin/set-role`, `setUserRole`, a membership's app roles) | carrying that role is refused; the client's retry gets a token from its session with the roles left. A token carrying fewer roles than held keeps working. |
| The user deleted | is refused. |
| Signing out, a revoked session, a stopped staff session | of that session is refused; the person's other sessions keep theirs. |
| Removal from the organization | naming that organization is refused, unless a global role still enters it. |

A refused token is a `401`, as an expired one is, and the client retries the request once with a new token from `/api/auth/token`. [Personal access tokens](/reference/personal-access-tokens/#when-it-stops) stop the same way. Tokens carry their session's id in `sid`; one from [`issueToken`](#tokens-for-scripts-and-curl) names none, and is checked against the user alone.

The cost is two or three lookups by key in the auth store per request: the session by `sid`, the user by `sub`, and with organizations the membership. Nothing is cached, so every server process sees a change at once. An open `/live` stream was admitted when it connected and keeps running until it closes. With `authenticate.jwksUrl` instead of sign-in of its own, the API cannot read the auth store and a token works until it expires, as do tokens of [other apps](#users-of-another-app).

### Signing keys

The app makes the keys that sign its tokens itself, and keeps them in the auth store, the private half encrypted with the app's `secret`. Every instance of the app signs with the same keys, since they share the database, and nobody supplies one.

The keys rotate. A key signs for 30 days (`signingKeyDays`); the first token after that makes a new key, which signs from then on. The replaced key stays in `/api/auth/jwks` for 7 more days (`signingKeyGraceDays`, at least 1), so the tokens it signed keep verifying until they expire, and is then deleted. A month bounds how long a leaked key could sign, and keeps the key set to a few keys. A week is far longer than any token lasts (a day at most, from [`protobase token`](#tokens-for-scripts-and-curl)), so an API that caches the key set, such as another app reading `/api/auth/jwks`, never refuses a token signed just before a rotation. The ES256 key of the [Supabase-compatible tokens](#supabase-js-and-supabasessr) rotates the same way. A key made by a version before rotation expires 30 days after it was made, or at once when it is older.

```ts
export default defineConfig({ signingKeyDays: 90, signingKeyGraceDays: 14 })
```

#### Changing the secret

The secret encrypts the signing keys, so with a new `secret` alone the app cannot read them, and making a token fails with `Failed to decrypt private key`. List the old secret in `previousSecrets`, newest first, or in `PROTOBASE_PREVIOUS_SECRETS`, comma separated:

```sh
PROTOBASE_SECRET=<the new secret>
PROTOBASE_PREVIOUS_SECRETS=<the old secret>
```

The app then encrypts with the new secret and still decrypts what an old one encrypted, so it keeps signing with the same key, and the tokens in flight keep verifying. Keep an old secret listed:

- until the keys it encrypted have rotated out, `signingKeyDays` after the change: the next keys are encrypted with the new secret;
- while people use the [authenticator apps](#two-factor-authentication) they set up before the change, whose secrets it encrypted too, and, with `encryptOAuthTokens`, while the tokens it encrypted for social sign-ins are needed.

What the old secret signed stops working: session cookies, so everyone signs in again, and links already sent, such as invitations and download links. Give every instance the same secrets: an instance that knows only the old secret cannot read a key made with the new one.

## Users of another app

An API can admit the signed-in users of another Protobase app with the tokens that app issues, so that app's admin app can draw its resources as [remote resources](/reference/remote-resources/). `authenticate.apps` lists each such app by its `url`, the issuer of its tokens, with the roles its users' global roles become here:

```ts
authenticate: { apps: [{ issuer: 'https://shop.example.com', roles: { admin: 'shop' }, tenant: 1 }] }
```

Their tokens are verified against that app's keys at `<issuer>/api/auth/jwks`; a role it does not map is dropped, a role held in one of its organizations never counts, and a user left with none gets `403`; their id here is `<sub>@<that app's host>`. See [Signing in at the source](/reference/remote-resources/#signing-in-at-the-source).

## supabase-js and @supabase/ssr

:::caution[Beta]
MFA, passkeys, SSO, phone and anonymous sign-in, the admin API and changing the address are not offered yet, as the list below says.
:::

An app moving from Supabase keeps its `supabase.auth` calls and its `@supabase/ssr` session checks: the app serves GoTrue's endpoints at `/api/sb/auth/v1`, over the same Better Auth sign-in, so `createClient(<the app's origin>/api/sb, <publishable key>)` signs in, refreshes, reads the user and signs out as on Supabase.

- `signInWithPassword`, `signInWithOtp` then `verifyOtp({ email, token, type: 'email' })`, `signInWithOAuth` with one of the app's [sign-in providers](#sign-in-with-github) (PKCE, as `@supabase/ssr` uses, or the implicit flow), `refreshSession`, `getUser`, `getClaims`, `updateUser({ password, data })` and `signOut` work. Each goes through Better Auth's own endpoint, with its rate limits and the [sign-in policy](#sign-in-policy).
  - The implicit flow is for an https `redirect_to` whose exact origin is a trusted origin. For http, including localhost, custom schemes and hosts that only a wildcard pattern in `auth.trustedOrigins` matches, use PKCE: supabase-js `flowType: 'pkce'`; `@supabase/ssr` already uses it.
  - The sign-in must start at `/api/sb/auth/v1/authorize` in the same browser: `/api/sb/auth/v1/callback` hands a code or a session only at the end of a provider sign-in started there.
  - The browser keeps no Protobase session afterwards: the app holds its own.
  - A wildcard pattern in `auth.trustedOrigins` still trusts every host it matches with the sign-in code, so list only hosts you control.
- Addresses are proved with the emailed 6-digit code, never a link. `signUp({ email, password, options: { data } })` needs [open sign-up](#open-sign-up) and mails a sign-up code; `verifyOtp({ email, token, type: 'signup' })` makes the account, with `data` in the [user metadata column](#an-existing-users-table), and signs in. Until then there is no account and `signUp` answers no user. `resetPasswordForEmail` mails a sign-in code; `verifyOtp` with `type: 'recovery'` signs in, and `updateUser({ password })` sets the new password. Every new password through `updateUser` signs out the user's other sessions and [MCP clients](#oauth-for-mcp-clients), and emails the address when the app has mail.
- The access token is ES256, valid for an hour, with Supabase's claims: `sub`, `role: authenticated`, `aud: authenticated`, `email`, `app_metadata`, `user_metadata`, `aal`, `session_id`, issued by `<url>/api/sb/auth/v1`. Its keys are at `/api/sb/auth/v1/.well-known/jwks.json`. It is apart from the EdDSA token of [Tokens and roles](#tokens-and-roles): neither is accepted for the other.
- The refresh token is the Better Auth session's token. Each refresh gives the session a new one, so a refresh token works once, and signing out, a ban or a revoked session ends it.
- `email_confirmed_at` is the time the address was confirmed, in the user table's `email_confirmed_at` column. An account verified before that column existed has none.
- Not offered:
  - <gap>`/api/sb/auth/v1` does not offer MFA.</gap>
  - <gap>`/api/sb/auth/v1` does not offer passkeys.</gap>
  - <gap>`/api/sb/auth/v1` does not offer SSO.</gap>
  - <gap>`/api/sb/auth/v1` does not offer phone sign-in.</gap>
  - <gap>`/api/sb/auth/v1` does not offer anonymous sign-in.</gap>
  - <gap>`/api/sb/auth/v1` does not offer the admin API.</gap>
  - <gap>`/api/sb/auth/v1` does not offer changing the address.</gap>

## Tokens for scripts and curl

There is no development login. A script that runs on its own, such as a weekly job, uses a [personal access token](/reference/personal-access-tokens/) its person makes on the account page, when the app turns them on. For scripts on the host, mint a token for an existing user (the CLI exposes it as `protobase token you@example.com`):

```ts
import { loadProjectAuth } from '@protobase/cli/auth'
import { issueToken } from '@protobase/server'

const auth = await loadProjectAuth(process.cwd())
const { token, expiresAt } = await issueToken(auth, { email: 'you@example.com', ttlSeconds: 3600 }) // default 15 minutes, at most 24 hours
const inGlobex = await issueToken(auth, { email: 'you@example.com', organization: 'globex' }) // with organizations
```

It is signed with the same keys and carries the same claims as a token from `/api/auth/token` for a new session of the user, with the role the user last chose, else their first, so the API treats it as any other. With [organizations](#organizations) it works in the organization a new session would start in, the one the user last worked in, else their oldest membership, and carries its `org`, `org_role` and `app_roles`; `organization`, an id or slug (`protobase token --organization`), names another, and is refused when the user may not work there, and a user in no organization gets a token without one. A ban, a role taken away or the user deleted ends it before it expires. Banned and unknown users get an error. There is no HTTP route for this.

## OAuth for MCP clients

With `mcp`, the app is an OAuth provider for MCP clients, such as AI assistants and code editors that speak MCP: a person adds the app's MCP address to the client, the client registers itself, the person signs in on the app's own pages and allows it on the connect page, and the client gets tokens that act as that person. What the client can do with them is in [MCP](/reference/mcp/).

```ts
auth: { mcp: true }
auth: { mcp: { path: '/api/mcp', connectPage: '/-/connect' } }
```

- `path` is the MCP endpoint's path on the origin of the app's `url`, its OAuth resource (default `/api/mcp`); `connectPage` is the connect page's path (default `/-/connect`, for a UI at the root). A client's metadata document is fetched through a transport that refuses private and reserved addresses.
- It needs an https `url`, or localhost. Every store has the OAuth tables (see [migrations](#migrations)), so turning MCP on or off needs no migration. Turning it off drops nothing: the clients and grants stay, and work again once MCP is on, so disconnect the clients first to forget them. While MCP is off, ending a person's sessions, banning them or setting their password disconnects none of their clients. Clients connect through the origin of `url` only, whatever [other origins](#several-origins) the app has. Changing `path` makes every client connect again.
- Clients find the provider at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`, register at `/api/auth/oauth2/register` (dynamic registration) or are known by an https client id that names their metadata document (CIMD), and are asked for nothing per client. Back-channel logout, a key set URL at registration (`jwks_uri`) and the client credentials grant are refused, though a client with a metadata document may publish its keys on its own origin, and the provider's client management, userinfo, logout and consent endpoints are closed.
- The scopes are `mcp` and `offline_access`, which is added when a client leaves it out. Access tokens last 15 minutes, carry the MCP resource as their audience and `typ: at+jwt`, and work for MCP only: the app's API refuses them, and the MCP endpoint refuses the app's own tokens. Tokens for the API are [another resource](#oauth-tokens-for-the-api). Refresh tokens roll for 30 days. The MCP endpoint verifies them, and checks on every request that the person still allows the client, still exists unbanned and still holds each role the token carries, so a disconnected client, a ban, a lowered role or a deleted user stops its access tokens at the next request rather than at their expiry; a lookup that fails refuses the request. A client that binds its tokens to a key (DPoP) sends a proof with each, checked against the resource's URL.
- A grant keeps the role and organization the person worked in when they allowed the client. A refresh is refused once they no longer hold that role or may no longer enter that organization, once the [sign-in policy](#sign-in-policy) requires something they have not set up, and while they are banned; access tokens already issued last out their 15 minutes. A grant made without a role is refused.
- Someone who has not set up what the sign-in policy requires is sent to the setup page first. Staff signed in as a person cannot allow a client, nor disconnect one. An account whose address is not verified cannot connect a client until it signs in once with an emailed code: a provider sign-up whose provider did not vouch for the address, or a password account created before Protobase created accounts verified. With password-only sign-in, or without mail, it cannot.
- The connect page shows the client's name as the client's own claim, who published it for a client with an https id, where the code goes (a website by its host, an app on this computer by its port, or an app on the device by its whole address), and the signed-in address. It cannot be used inside another site's frame, and Allow takes a click only once the page has been in front for half a second. `protobase serve` and `protobase dev` send `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` with every page of the UI; a host that serves `public/` itself should send them too. A host's own consent screen arms its Allow button the same way with the guard `@protobase/ui` exports (see [the plugin API](/reference/plugins/#api)).
- The account page lists the clients a person allowed, under Connected apps, and disconnects any one: its consent is forgotten and its tokens revoked, access tokens already issued included, so it has to ask again. A client published at a URL has one id for everyone, so two copies of it allowed on one account with the same role show as one entry, and disconnecting it disconnects both.
- Signing out everywhere, signing out the other devices, a password change, a password reset, an admin ending the person's sessions, banning them, setting their password or marking their address unverified, and `protobase users disable` disconnect every client and forget which were allowed, so each has to ask again; enabling a disabled user brings none back. Through the [endpoints for supabase-js](#supabase-js-and-supabasessr) the same holds for signing out with the `global` or `others` scope and for every new password set with `PUT /user`, since a password reset ends there too. Signing out of one browser, or a session expiring, disconnects nothing.
- A refresh token presented again after it was rotated, outside the provider's 30-second window for a retried request, is taken for stolen: that client is disconnected for the person, its access tokens stop at the next request, and it has to ask again. Their other clients keep working.

### OAuth tokens for the API

:::caution[Beta]
It needs `mcp` on, so the app serves its MCP endpoint too, and the API takes these tokens as bearer tokens only.
:::

With `oauth.api`, the same provider gives clients access tokens for the app's API, so an app of your own, such as a phone or watch app, signs people in through the app's own sign-in and calls the API as them with `Authorization: Bearer <token>`.

```ts
auth: { mcp: true, oauth: { api: true } }
```

- The API is the resource `/api` on the origin of the app's `url`, such as `https://app.example.com/api`. A client asks for it with that `resource` parameter (RFC 8707) at authorize; without one, its token is for MCP as before. A client registered before `oauth.api` was on cannot ask for it, and registers again.
- The person signs in and allows the client on the connect page, as for an MCP client. The token acts as them, with the role and organization they worked in when they allowed it, under the same access rules as their own token. MCP's write approval does not apply to the API, so the API refuses MCP's tokens and the MCP endpoint refuses the API's.
- Access tokens last 15 minutes and refresh for 30 days. On every request the API checks what the MCP endpoint checks: that the person still allows the client, still exists unbanned and still holds the token's role, so disconnecting the client on the account page, a ban, a lowered role or a deletion stops its tokens at the next request. Turning `oauth.api` off makes the API refuse them at once.
- Notifications and calls refuse these tokens, as they refuse an MCP client's.
- <gap>The app's API cannot take DPoP-bound access tokens because checking a proof against the API's URLs is not implemented.</gap> A token bound to a key is refused when it is sent as a bearer token.

## OpenID provider for other apps

With `openIdProvider`, the app is an OpenID provider for the clients its admins register and those its config declares, such as other apps that let people sign in with it: a person signs in on the app's own pages, as they always do, and the client gets an ID token that says who they are. Nobody is asked to allow a client, since only an admin or the app's developer adds one. A phone app the admin registers can also get ID tokens for every app at the origins `audiences` names, with no registration per app, through the [token exchange](#token-exchange).

```ts
auth: { openIdProvider: true }
auth: { openIdProvider: { connectPage: '/-/connect', audiences: ['https://*.example.app'], subject: 'grant' } }
```

- **Audiences** are https origins, exact (`https://shop.example.com`) or with one leading wildcard label (`https://*.example.app`, which stands for `shop.example.app` but not `example.app` or `a.b.example.app`). A wildcard needs two labels after it, and a pattern takes no port, path, query or user info; anything else stops the app at start. An app at such an origin gets ID tokens only from the token exchange: no browser is ever sent there, so an authorize whose client id or redirect URI is on such a host is refused (`400 invalid_request`), and so is registering a client with a redirect URI there (`400 REDIRECT_ON_AUDIENCE_HOST`).

- **Only registered clients.** Nothing registers itself: `/api/auth/oauth2/register` is closed, and so are the provider's own client management, consent, userinfo, introspection and logout endpoints. A client the admin did not register through the API below, and the config does not [declare](#declared-clients), is refused with `400 invalid_client` at authorize and at the token endpoint, before anything else, and so is a client in the store from elsewhere, such as one an MCP client registered while the app had `mcp` on. A redirect URI must be one the client registered, character for character, so the person's browser is never sent with a code, or an error, to an address of someone else's.
- **Not with `mcp`.** MCP clients register themselves, and the provider of this mode is separate from MCP's, so the server refuses to start with both. Serve them from separate apps.
- **Discovery** is at `/.well-known/openid-configuration`, with the app's `url` as issuer, and the keys at `/api/auth/jwks`. A client uses the authorization code flow with PKCE, with `openid email profile`, and a `nonce`.
- **The ID token** is signed with the app's [signing keys](#signing-keys) (EdDSA) and lives 5 minutes. It carries `iss` (the app's `url`), `aud` (the client's id, alone), `sub` (the person's user id in this app, or the [grant's subject](#grant-subjects)), `email`, `email_verified`, and `name` when the person has one. It has no `jti`. Another Protobase app takes it as its [platform sign-in provider](#platform-sign-in-providers), through its pages or by [token sign-in](#token-sign-in).
- **Signing in** goes through the connect page (`connectPage`, default `/-/connect`), which signs the person in and goes straight on to the client. Someone who has not set up what the [sign-in policy](#sign-in-policy) requires is sent to the setup page first, and staff signed in as a person get no token.

### Grant subjects

With `subject: 'grant'`, an ID token's `sub` names the client's grant, never the person's id: the client's tokens from one sign-in at the app. A fresh sign-in is a new grant with a new subject, and the grant's refresh tokens and token exchanges keep it. So each sign-in of a phone app is a device of its own to the apps that take its tokens, such as an app whose platform provider signs in [device accounts](#device-accounts), and signing one device out there leaves the others. The subject is a hash of the grant, so it says nothing of the person and stays when the app's [secret changes](#changing-the-secret); `email` and `email_verified` still say who they are. The default, `subject: 'user'`, keeps the person's user id.

### Declared clients

The app's own clients, such as its phone app, can be declared in the config instead, with the fields the admin API takes and the client id the client ships with, so every deploy has them with no admin account and no manual step:

```ts
auth: { openIdProvider: { clients: [{ clientId: 'example-phone', name: 'Phone', redirectUris: ['com.example.phone:/signed-in'], type: 'public', exchange: true }] } }
```

- A declared client works as a registered `public` one does: discovery, the authorization code flow with PKCE, ID tokens, and, with `exchange: true`, refresh tokens and the [token exchange](#token-exchange), to and from registered clients alike. The admin API neither lists nor deletes it.
- Its record is written on its first request and rewritten when the config changes it.
- Removed from the config, it is refused with `400 invalid_client` from the next deploy on, its refresh tokens included. Declaring the same id again brings back its tokens that have not expired.
- The app refuses to start with an id declared twice, a field missing, or a redirect URI the provider cannot send a browser to: one with a fragment, plain `http` other than to a loopback address, or one on a host of `audiences`. An id an admin also registered a client under is refused with `400 invalid_client` rather than served as either: delete the registered one.
- <gap>A declared client cannot be `confidential` because a store for declared clients' secrets is not implemented.</gap>

### Registering clients

An admin registers, lists and deletes the clients with their own session; anyone else is refused with `403 ADMIN_ONLY`:

```http
POST /api/auth/openid-provider/clients
{ "name": "Shop", "redirectUris": ["https://shop.example.com/api/auth/callback/oidc"], "type": "confidential" }
→ { "clientId": "...", "clientSecret": "..." }

GET /api/auth/openid-provider/clients
→ [{ "clientId": "...", "name": "Shop", "redirectUris": [...], "type": "confidential", "exchange": false }]

POST /api/auth/openid-provider/clients/delete
{ "clientId": "..." }
```

- `confidential` is an app with a server, which authenticates with the secret it gets once, in a Basic header; `public` is an app on a device, such as a phone app, which has no secret and uses PKCE alone.
- Every client skips consent, must use PKCE, and gets the scopes `openid email profile`.
- `exchange: true` lets a client exchange its access token for ID tokens of the other clients (below), and gives it refresh tokens (`offline_access`). Only the app that signs people in on their device for the other apps should have it: it can sign its people in to every other client.
- Deleting a client deletes its tokens too, so its refresh tokens stop at once.

### Token exchange

A client registered with `exchange: true`, such as a phone app the person signed in to once, gets an ID token for another registered client, or for an origin of `audiences`, without a browser, and posts it to that app's [token sign-in](#token-sign-in). It is the token exchange of RFC 8693 at the token endpoint:

```http
POST /api/auth/oauth2/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&client_id=<its own id>
&subject_token=<its access token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&requested_token_type=urn:ietf:params:oauth:token-type:id_token
&audience=<the other client's id, or an origin such as https://shop.example.app>
→ { "access_token": "<ID token>", "issued_token_type": "urn:ietf:params:oauth:token-type:id_token", "token_type": "N_A", "expires_in": 300 }
```

- **The subject is the caller's own person.** `subject_token` must be a live access token this app issued to the calling client itself: not an ID token, a refresh token or another client's token, not expired, revoked or from a session that ended. Otherwise it answers `400 invalid_grant`. A client without `exchange` gets `400 unauthorized_client`.
- **The audience is another registered or [declared](#declared-clients) client, or an origin of `audiences`**: not the caller, not an unknown client and not one the admin did not register or the config does not declare (`400 invalid_target`). An origin is matched as the URL parser writes it, label by label, so `http://`, a port, a path or trailing slash, user info, upper case, an extra label (`a.b.example.app`) and look-alikes (`example.app.evil.com`, `evilexample.app`) are refused.
- **An ID token only.** The answer is an ID token for that client or origin alone, living 5 minutes, with the claims of the client's own sign-in; one for an origin has that origin as `aud`, and a `jti`. No access or refresh token for the other client leaves the app. `requested_token_type` and `subject_token_type` take only the values above (`400 invalid_request`).
- **The device name:** `device_name=<name>` names the device the caller runs on, such as `Ana's phone`; the ID token carries it as the `device_name` claim, trimmed and cut to 64 characters, which another app shows for a [device account](#device-accounts). Without it, or blank, the claim is left out.
- **A banned person, or one whose address is not verified,** gets none (`400 invalid_grant`). A ban after the token was issued is caught by the other app, which checks its own account at sign-in.
- The token endpoint takes 20 requests a minute per client address.


## Several origins

An app can be served on more than one origin, such as its platform address and the customer's own domain. `auth.origins` lists the others; it defaults to `PROTOBASE_ORIGINS`, which a platform sets:

```ts
url: 'https://erp-x1.protobase.net',
auth: { origins: ['https://admin.shop.com'], passkeyDomain: 'admin.shop.com' },
```

- A request to one of them is answered for its own host: the sign-in callbacks, the [password reset](#password-reset) link and its `redirectTo`, an invitation link, to the [app](#users-page) or an [organization](#organizations), unless `invitationUrl` names another page, and a [staff sign-in](#staff-sign-in) stay there. A request to any other host is answered for the app's `url`.
- Tokens keep the app's `url` as issuer and audience, whichever origin issued them, so the API takes them on every origin.
- Sessions are cookies of each host: a person signs in once per origin.
- `GET /.well-known/webauthn` answers `{ "origins": [...] }` with every origin of the app, on each of them, so its [passkeys](#passkeys) work on all. `protobase serve` and `protobase dev` send that path to the server, whatever the bundle's `api` says; a host in front must too.
- Each origin is a URL with the scheme of the app's `url`; one that is not stops the server at startup. The host that serves the app must pass each origin's own `Host` header on.
- The app's own origins may call each other's API from the browser ([CORS](/reference/api/#cors)).

## Public endpoints

Only the Better Auth routes under `/api/auth/*` (sign-in, password reset, [open sign-up](#open-sign-up), the start and callback of a [staff sign-in](#staff-sign-in), and with [MCP](#oauth-for-mcp-clients) the OAuth provider's register, token and authorize, and the like), `GET /api/auth/status`, with MCP the two OAuth discovery documents under `/.well-known/`, and, with [several origins](#several-origins), `GET /.well-known/webauthn` are reachable without a token; the account, policy and staff session endpoints there need a session. The API (`/api/v1/*`) and the system endpoints (`/api/meta`, `/api/openapi.json`, `/api/docs`) all answer `401` without one, but for what an [anonymous role](/reference/access/#anonymous-access) reads in `/api/v1` and `/api/meta`, when the project defines one. [Public forms](/reference/forms/#routes) (`/api/forms/*`) need no token either.

## Roles and access in the API

Roles are bundles of capabilities (`defineRoles` in `@protobase/schema`: `orders.read.own`, `costs.read`, `*.read`, ...). Export the result as `roles` from `config/roles.ts`, where Protobase finds it, and every operation without an explicit rule needs the matching capability; a capability may be limited to [fields and rows](/reference/access/#capabilities). The token's `roles` become `ctx.user.roles` in rules; the user id (`sub`) is what `.own` compares with the resource's `.owner(...)` field, so it must be the id that field stores. How the API enforces them (hidden fields, row filters, record permissions) is in [the REST API reference](/reference/api/#access).

**User ids.** Better Auth gives a new user a random 32-character text id, so an `.owner(...)` field holds `text`: the server refuses to start (`protobase dev`, `serve`) when one holds integers or UUIDs, naming the field. An app whose owner columns are integers, such as a relation to its own users table, gives the `generateUserId` [hook](#hooks) the next value of that table's sequence, and adds the user's row there, as the ERP example does (`tests/apps/erp/auth/hooks.ts`, with the row added by `db/migrations/019_auth_users.sql` when someone joins an organization). One whose owner columns are UUIDs sets `auth: { generateUserId: 'uuid' }` (see [An existing users table](#an-existing-users-table)). An authenticator that maps the signed-in account to a user of the app's own, such as one in `auth/authenticate.ts` that returns the id of a row in its users table, usually made over the app's sign-in with `overSignIn` ([Tokens and roles](#tokens-and-roles)), declares the type of those ids instead, `Object.assign(authenticate, { userIdType: 'uuid' })` (or `'integer'`, `'bigint'`, `'text'`), and the owner fields are checked against that, by `protobase doctor` too. A request by a user whose id the owner field cannot hold, such as one made before `generateUserId`, fails with an `owner-id-mismatch` problem that names the field.
