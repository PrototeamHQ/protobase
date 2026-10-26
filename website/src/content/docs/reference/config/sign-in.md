---
title: Sign-in options
description: The config keys of sign-in, auth and authenticate, each with its type, default and environment variable, and the files where sign-in's hooks, mailer, mail templates and an authenticator of the project's own go.
---

The keys of sign-in and of how the API verifies tokens, in [`protobase.config.ts`](/reference/config/). The app's URL, secrets and name, which sign-in uses, are the top-level [`url`, `secret`, `previousSecrets` and `name`](/reference/config/app/). How sign-in works is in [Login with Better Auth](/reference/auth/).

## auth

- **Type:** `AuthConfig | false`
- **Default:** on, with the defaults below; off when [`authenticate.jwksUrl`](#authenticatejwksurl) trusts an auth server elsewhere

Sign-in, with its store in the app's own database. `false` turns it off; an app without sign-in then verifies tokens with [`authenticate`](#authenticate) or `auth/authenticate.ts`.

```ts
export default defineConfig({ auth: { roles: ['admin', 'sales'], signInFirst: 'emailCode' } })
```

Sign-in runs the project's own code from these files, each loaded when Protobase builds sign-in:

- `auth/hooks.ts`: the hooks, as named exports typed with `AuthHooks` from `@protobase/server`: `generateUserId`, `onUserCreated`, `generateOrganizationId`, `onOrganizationCreated`, `beforeOrganizationDeleted` and `organizationHooks`. Each gets the app's database, `{ db }`, as its last argument. See [Hooks](/reference/auth/#hooks).
- `auth/mailer.ts`: a mailer of the project's own for sign-in's mail, as its default export, in place of the SMTP mailer. See [Email](/reference/email/).
- `emails/`: the templates of sign-in's mail. See [Templates](/reference/email/#templates).

With [extensions](/reference/config/#extensions), the hooks and the mailer are those of the last folder whose config sets `auth`.

## auth.roles

- **Type:** `string[] | Record<string, string | { label: string; grants?: string[] }>`
- **Default:** `['admin', 'user']`

The roles users can hold. `admin` is always included. With [`organizations`](#authorganizations), give each a label, and optionally the other roles its holders may also give members. The capabilities each role has are `config/roles.ts`'s (see [Access](/reference/access/)). See [Roles](/reference/auth/#roles).

```ts
export default defineConfig({
  auth: { roles: { manager: { label: 'Manager', grants: ['sales'] }, sales: 'Sales' }, organizations: true },
})
```

## auth.defaultRole

- **Type:** `string`
- **Default:** none; with exactly one role besides `admin`, that role

The role of a user created without one. Without a default, and with more than one role besides `admin`, creating a user without a role is an error that asks for one.

```ts
export default defineConfig({ auth: { roles: ['admin', 'sales', 'warehouse'], defaultRole: 'sales' } })
```

## auth.organizations

- **Type:** `true | { create?: 'admins' | 'everyone'; creatorAppRoles?: 'all' | string[]; invitationDays?: number; membershipLimit?: number; deleteRecords?: 'refuse' | 'cascade'; invitationUrl?: string }`
- **Default:** off: the app works as one organization

Turns on organizations: people work in one at a time, records of `.tenant` resources are scoped to it, and roles are held globally or per membership. `create` is who may create one (default `admins`), `creatorAppRoles` the roles its creator holds there (default `all`), `invitationDays` how long an invitation works (default 7), `membershipLimit` the most members (default 1000), `deleteRecords` whether deleting one is refused while it has records (`refuse`, the default) or left to the foreign keys (`cascade`), and `invitationUrl` the page an invitation opens (default `<url>/-/invitation`). Its hooks are in `auth/hooks.ts`. See [Organizations](/reference/auth/#organizations).

```ts
export default defineConfig({ auth: { organizations: { create: 'everyone', invitationDays: 14 } } })
```

## auth.signUp

- **Type:** `{ role: string }`
- **Default:** off

Open sign-up: anyone makes their own account from the sign-in page, with `role`, after proving their address with an emailed code. Needs a mailer. `role` is one of [`roles`](#authroles) and never `admin`. Not with organizations. See [Open sign-up](/reference/auth/#open-sign-up).

```ts
export default defineConfig({ auth: { roles: ['admin', 'customer'], signUp: { role: 'customer' } } })
```

## auth.signInPolicy

- **Type:** `Partial<{ password: 'allowed' | 'forbidden'; emailCode: 'allowed' | 'forbidden'; passkey: 'allowed' | 'required' | 'forbidden'; twoFactor: 'allowed' | 'required' | 'forbidden'; staffAccess: 'allowed' | 'notify' | 'forbidden'; platformSignIn: 'allowed' | 'forbidden' }>`
- **Default:** everything allowed

The sign-in policy that applies until an admin saves one on the Sign-in policy page, and when the saved one no longer reads. Checked at startup as an admin's save is. See [Sign-in policy](/reference/auth/#sign-in-policy).

```ts
export default defineConfig({ auth: { signInPolicy: { password: 'forbidden', twoFactor: 'required' } } })
```

## auth.signInFirst

- **Type:** `'password' | 'emailCode'`
- **Default:** `password`

What the sign-in page leads with: the address and a password, with emailing a code below it; or the address and "Email me a sign-in code", with the password behind "Use a password". Only while the policy leaves both on. See [Emailed sign-in codes](/reference/auth/#emailed-sign-in-codes).

```ts
export default defineConfig({ auth: { signInFirst: 'emailCode' } })
```

## auth.signInPerMinute

- **Type:** `number`
- **Default:** `5`

Sign-in attempts allowed per minute and client, and the sign-up requests allowed. See [Client addresses](/reference/auth/#client-addresses) for how a client is known.

```ts
export default defineConfig({ auth: { signInPerMinute: 10 } })
```

## auth.mailer

- **Type:** `false`
- **Default:** SMTP with `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`, when set
- **Environment variables:** `PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM`

`false` turns sign-in's mail off whatever the environment says: password reset, emailed codes, sign-up, staff sign-in and invitations are then not offered. A mailer of the project's own is `auth/mailer.ts`. See [Email](/reference/email/#configuration).

```ts
export default defineConfig({ auth: { mailer: false } })
```

## auth.socialProviders

- **Type:** Better Auth's `socialProviders`
- **Default:** none

Sign-in providers, such as `{ github: { clientId, clientSecret } }`; the callback is `<url>/api/auth/callback/<provider>`. A provider also signs up people without an account, with the default role. See [Sign-in with GitHub](/reference/auth/#sign-in-with-github).

```ts
export default defineConfig(({ env }) => ({
  auth: { socialProviders: { github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! } } },
}))
```

## auth.encryptOAuthTokens

- **Type:** `boolean`
- **Default:** `false`

Encrypts the OAuth access, refresh and ID tokens kept for social sign-ins, with the app's secret.

```ts
export default defineConfig({ auth: { encryptOAuthTokens: true } })
```

## auth.sso

- **Type:** `{ saml: { id: string; name?: string; domains: string[]; idp: { metadata: string } | { entityId: string; ssoUrl: string; certificate: string | string[] }; attributes?: { email?: string; name?: string; firstName?: string; lastName?: string } }[] }`
- **Default:** none

Single sign-on with SAML 2.0 identity providers. A provider signs up people without an account, with the default role, but only at its `domains`, where it also links to the account with the same address. `name` defaults to `SSO`. See [Sign-in with SAML](/reference/auth/#sign-in-with-saml).

```ts
export default defineConfig(({ env }) => ({
  auth: { sso: { saml: [{ id: 'okta', name: 'Okta', domains: ['example.com'], idp: { metadata: env.OKTA_METADATA! } }] } },
}))
```

## auth.signInProvider

- **Type:** `{ issuer: string; clientId: string; clientSecret: string; provider?: string; name?: string; scopes?: string[] } | false`
- **Default:** the provider of the environment variables below, when set
- **Environment variables:** `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID`, `PROTOBASE_SIGN_IN_CLIENT_SECRET`, and optionally `PROTOBASE_SIGN_IN_PROVIDER` and `PROTOBASE_SIGN_IN_NAME`

An OpenID Connect provider the platform adds for people who already have an account; it never signs anyone up. `provider` is its id (default `oidc`), `name` its button's name. `false` turns it off whatever the environment says. Left out when `socialProviders` has a provider with the same id. See [Platform sign-in provider](/reference/auth/#platform-sign-in-provider).

```ts
export default defineConfig({ auth: { signInProvider: false } })
```

## auth.operator

- **Type:** `{ issuer: string; clientId: string; clientSecret: string; name?: string; group?: string; scopes?: string[]; acrValues?: string[]; sessionMinutes?: number } | false`
- **Default:** the provider of the environment variables below, when set
- **Environment variables:** `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID`, `PROTOBASE_OPERATOR_CLIENT_SECRET`, and optionally `PROTOBASE_OPERATOR_NAME` and `PROTOBASE_OPERATOR_GROUP`

The identity provider the operator's staff sign in with to sign in as people of this app, for support. `group` is the ID token's group that allows it (default `protobase-staff-access`), and `sessionMinutes` how long a staff session lasts (default 30, at most 240). `false` turns staff sign-in off whatever the environment says. See [Staff sign-in](/reference/auth/#staff-sign-in).

```ts
export default defineConfig({ auth: { operator: false } })
```

## auth.passwordHashes

- **Type:** `'bcrypt'[]`
- **Default:** none

Password hashes another system wrote that sign-in accepts besides Better Auth's own, such as Supabase Auth's bcrypt. The first sign-in with one stores the password again as Better Auth hashes it. See [An existing users table](/reference/auth/#an-existing-users-table).

```ts
export default defineConfig({ auth: { passwordHashes: ['bcrypt'] } })
```

## auth.leakedPasswords

- **Type:** `boolean`
- **Default:** `false`

Refuses a new password that appears in a known data breach, by Have I Been Pwned's list. Only the first five characters of the password's SHA-1 hash leave the server. See [Leaked passwords](/reference/auth/#leaked-passwords).

```ts
export default defineConfig({ auth: { leakedPasswords: true } })
```

## auth.users

- **Type:** `{ table?: string; columns?: Record<string, string>; metadata?: string }`
- **Default:** the table `protobase auth migration` makes

The user table, when another system made it, such as Supabase's `auth.users`: its name, the columns named otherwise than Protobase names them, and a JSON column for each user's metadata. See [An existing users table](/reference/auth/#an-existing-users-table).

```ts
export default defineConfig({
  auth: { schema: 'auth', users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' } },
})
```

## auth.schema

- **Type:** `string`
- **Default:** `auth`

The schema of the auth store in the app's database. See [Admin store](/reference/auth/#admin-store).

```ts
export default defineConfig({ auth: { schema: 'accounts' } })
```

## auth.generateUserId

- **Type:** `'uuid'`
- **Default:** Better Auth's random 32-character text

`'uuid'` gives new users a random UUID, and makes every id column of the store a `uuid`. To take ids from the app instead, such as its own users sequence, export `generateUserId` from `auth/hooks.ts`.

```ts
export default defineConfig({ auth: { generateUserId: 'uuid' } })
```

## auth.origins

- **Type:** `string[]`
- **Default:** `PROTOBASE_ORIGINS`, comma separated; none otherwise
- **Environment variable:** `PROTOBASE_ORIGINS`

The other origins the app is served on, besides `url`. A request to one is answered for that host: its sign-in callbacks and the links it mails stay there, and passkeys work on every origin. Tokens keep `url` as issuer. See [Several origins](/reference/auth/#several-origins).

```ts
export default defineConfig({ auth: { origins: ['https://admin.shop.com'] } })
```

## auth.passkeyDomain

- **Type:** `string`
- **Default:** `PROTOBASE_PASSKEY_DOMAIN`, else the host of `url`
- **Environment variable:** `PROTOBASE_PASSKEY_DOMAIN`

The host new passkeys are made for: the host of `url` or of one of `origins`. Each passkey keeps the one it was made for, so changing it breaks none. See [Passkeys](/reference/auth/#passkeys).

```ts
export default defineConfig({ auth: { origins: ['https://admin.shop.com'], passkeyDomain: 'admin.shop.com' } })
```

## auth.trustedOrigins

- **Type:** `string[]`
- **Default:** `PROTOBASE_TRUSTED_ORIGINS`, comma separated
- **Environment variable:** `PROTOBASE_TRUSTED_ORIGINS`

Extra origins that may call the auth endpoints, such as the exact host of a dev tunnel; no wildcard is trusted. `url` and `origins` always are. Set in the config, it replaces the variable's list.

```ts
export default defineConfig(({ env }) => ({
  auth: { trustedOrigins: env.TUNNEL_URL ? [env.TUNNEL_URL] : undefined },
}))
```

## auth.mcp

- **Type:** `true | { path?: string; connectPage?: string }`
- **Default:** off

Turns on the OAuth provider for MCP clients, and with it the MCP endpoint: a client registers itself, the person signs in and allows it on the connect page, and the client gets tokens for the MCP endpoint only. `path` is the endpoint's (default `/api/mcp`), `connectPage` the page's (default `/-/connect`). Needs an https `url`, or localhost, and the OAuth tables from `protobase auth migration`. The endpoint's tools are [`mcpEndpoint`](/reference/config/api/#mcpendpoint). See [MCP](/reference/mcp/#turning-it-on).

```ts
export default defineConfig({ auth: { mcp: true } })
```

## authenticate

- **Type:** `AuthenticateSettings`
- **Default:** the tokens of `auth`

How the API verifies tokens: the app's own, those of an auth server elsewhere, and those of other Protobase apps it admits. An authenticator of the project's own, such as `jwtAuthenticator(...)` for tokens of another system, is the default export of `auth/authenticate.ts`, which replaces this key. See [Tokens and roles](/reference/auth/#tokens-and-roles).

```ts
export default defineConfig({ authenticate: { tenant: 'acme' } })
```

## authenticate.tenant

- **Type:** `string | number`

The one tenant everyone works in, for an app without organizations; never read from the token.

```ts
export default defineConfig({ authenticate: { tenant: 1 } })
```

## authenticate.jwksUrl

- **Type:** `string`

The key set of an auth server elsewhere, for an API that runs apart from it. Needs `issuer`. Set without `auth`, it turns the app's own sign-in off.

```ts
export default defineConfig({
  authenticate: { jwksUrl: 'https://auth.example.com/api/auth/jwks', issuer: 'https://auth.example.com' },
})
```

## authenticate.issuer

- **Type:** `string`
- **Default:** the app's `url`

The issuer the tokens must name; it is also their audience unless `audience` names another.

```ts
export default defineConfig({ authenticate: { jwksUrl: 'https://auth.example.com/api/auth/jwks', issuer: 'https://auth.example.com' } })
```

## authenticate.audience

- **Type:** `string`
- **Default:** `issuer`

The audience the tokens must name.

```ts
export default defineConfig({ authenticate: { jwksUrl: 'https://auth.example.com/api/auth/jwks', issuer: 'https://auth.example.com', audience: 'https://api.example.com' } })
```

## authenticate.organizations

- **Type:** `boolean`
- **Default:** read from `auth`

Whether the tokens carry organizations. Needed with `jwksUrl` only.

```ts
export default defineConfig({ authenticate: { jwksUrl: 'https://auth.example.com/api/auth/jwks', issuer: 'https://auth.example.com', organizations: true } })
```

## authenticate.cache

- **Type:** `{ refreshMs?: number; minReloadMs?: number }`
- **Default:** `{ refreshMs: 600000, minReloadMs: 30000 }`

How long the key set is kept: reloaded whole every `refreshMs`, so removed keys stop working, and when a token names an unknown key, at most every `minReloadMs`.

```ts
export default defineConfig({ authenticate: { cache: { refreshMs: 60_000 } } })
```

## authenticate.apps

- **Type:** `{ issuer: string; roles: Record<string, string | string[]>; tenant?: string | number }[]`
- **Default:** none

Other Protobase apps whose signed-in users this API admits with their own tokens, so their admin apps can draw its resources. `issuer` is that app's `url`, `roles` maps its global roles to this app's (a role it does not list is dropped, and a user left with none is refused), and `tenant` is where its users work. See [Users of another app](/reference/auth/#users-of-another-app).

```ts
export default defineConfig({
  authenticate: { apps: [{ issuer: 'https://admin.shop.com', roles: { admin: 'shop' } }] },
})
```

## signingKeyDays

- **Type:** `number`
- **Default:** `30`

Days a token signing key signs; the first token after that makes a new key. A month bounds how long a leaked key could sign, and keeps the key set to a few keys. A top-level key, beside `auth`. See [Signing keys](/reference/auth/#signing-keys).

```ts
export default defineConfig({ signingKeyDays: 90 })
```

## signingKeyGraceDays

- **Type:** `number`, at least `1`
- **Default:** `7`

Days a replaced signing key stays in the key set, so the tokens it signed keep verifying until they expire; it is deleted after that. A week is far longer than any token lasts, a day at most, so an API that caches the key set never refuses a token signed just before a rotation. A top-level key, beside `auth`.

```ts
export default defineConfig({ signingKeyGraceDays: 14 })
```
