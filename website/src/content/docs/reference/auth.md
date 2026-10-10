---
title: Login with Better Auth
description: Sign-in with Better Auth, with the admin store, sign-in methods and policy, sign-in providers, staff sign-in, roles, tokens and the public endpoints.
---

`@protobase/server` ships a [Better Auth](https://www.better-auth.com) setup (version 1.7): sign-in with a password, an [emailed code](#emailed-sign-in-codes) or a [passkey](#passkeys), [two-factor authentication](#two-factor-authentication), a [sign-in policy](#sign-in-policy) admins set in the app, [staff sign-in](#staff-sign-in) for the team that runs the app, roles, and short-lived JWTs that the API verifies against Better Auth's own JWKS. All of it is Better Auth's own plugins (`emailOTP`, `twoFactor`, `@better-auth/passkey`), wired by `createAuth`.

```ts
import { betterAuthAuthenticator, createAdmin, createAuth } from '@protobase/server'

const auth = createAuth({ database: pool, baseURL: 'https://admin.example.com', secret: process.env.BETTER_AUTH_SECRET! })
const admin = createAdmin({ resources, db, auth, authenticate: betterAuthAuthenticator({ auth, tenant: 1 }) })
```

`createAdmin({ auth })` mounts Better Auth at `/api/auth/*` next to the API at `/api/v1`.

## Admin store

Users, sessions and signing keys stay apart from the application's tables. The ERP example keeps them in an `auth` schema of its own database, so a host that gives an application one database (and a role that cannot create databases) is enough:

```ts
createAuth({ database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth', transaction: true }, ... })
```

### Migrations

The store's tables are part of the project's migrations, committed in the repository like the application's own: the examples carry them as `db/migrations/*_auth.sql`, and their `db:migrate` applies both. When an upgrade of Protobase (or another Better Auth plugin) needs more tables or columns, write the change as the project's next migration:

```sh
bun run db:migrate                  # the database at the project's current schema
bun run protobase auth migration    # compares it with what Better Auth needs; writes db/migrations/NNN_auth.sql
bun run db:migrate                  # applies it
```

The file only adds tables, columns and indexes, never drops one, and is plain SQL to review, edit or leave out where the project handles the auth schema itself. `--dir` and `--name` choose the folder and the name after the number.

The store's tables and columns are snake_case, like the app's (`sign_in_policy.platform_sign_in`, `session.user_id`); the code and the API keep Better Auth's camelCase names. A store set up by Protobase 0.6 has Better Auth's camelCase names instead (`"signInPolicy"."platformSignIn"`): for it, `protobase auth migration` writes the migration that renames its tables, columns, indexes and constraints in place, keeping every row. The examples carry it as `db/migrations/*_auth_snake_case.sql`; on a store with the snake_case names it does nothing.

The server never changes the schema. `protobase serve` and `protobase dev` read it at startup and refuse to start while it lacks a table or column Better Auth needs, naming them and `protobase auth migration`; without that check every sign-in would fail (`500`, "Database schema mismatch"). The examples' `db:migrate` applies all pending files in one transaction, so a migration that fails leaves the database as the running version expects it. The host must guarantee the rest: nothing but the migrations writes while they run, and the new version serves only after they succeeded.

Upgrading from 0.5 or earlier, where `auth:migrate` created the tables, goes through 0.6. With Protobase 0.6, run `protobase auth migration` twice, once with `DATABASE_URL` on an empty database with only the project's own migrations applied (it writes the whole store), then on the project's database (it writes what this version adds). Every statement skips what exists already, so both files apply to new databases and to those `auth:migrate` set up. The `auth:migrate` script and `db/auth-migrate.ts` can then go, and the upgrade goes on as from 0.6.

`createAuth` takes a `pg` Pool or `{ dialect, type: 'postgres', schemaName? }` as `database`; without `schemaName` the tables go to the connection's `search_path` (usually `public`). The examples keep the store in the `auth` schema of `DATABASE_URL`'s database, so their migrations cover both.

## Configuration

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET` | signs cookies and encrypts the token keys; `openssl rand -base64 32`; never committed (`.env.example` has a placeholder) |
| `BETTER_AUTH_URL` | public URL of the API (default `http://localhost:5173`); issuer and audience of the tokens; when tunnelling, the https tunnel URL |
| `TRUSTED_ORIGINS` | extra comma separated origins; `https://*.trycloudflare.com` is always trusted |
| `PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM` | the mail server and sender for [password reset](#password-reset), [emailed sign-in codes](#emailed-sign-in-codes) and emailed [two-factor](#two-factor-authentication) codes, passed by the platform; all three are off without them |
| `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID`, `PROTOBASE_SIGN_IN_CLIENT_SECRET` | the [platform sign-in provider](#platform-sign-in-provider) for people who have an account, passed by the platform; off without them. `PROTOBASE_SIGN_IN_PROVIDER` and `PROTOBASE_SIGN_IN_NAME` are optional |
| `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID`, `PROTOBASE_OPERATOR_CLIENT_SECRET` | the [operator provider](#operator-provider) its staff sign in with to sign in as people, passed by the platform; staff sign-in is off without them. `PROTOBASE_OPERATOR_NAME` and `PROTOBASE_OPERATOR_GROUP` are optional |

- Cookies are `SameSite=Lax`, and `Secure` when `BETTER_AUTH_URL` is https.
- Sign-in is rate limited (5 password attempts per minute and client by default, `signInPerMinute`; 3 per minute for emailed codes); the limiter keys on `x-forwarded-for`, so run behind a proxy that sets it.
- Passwords need at least 12 characters.
- `appName` (default `Protobase`) is the name authenticator apps and passkey prompts show.

## First run

Accounts are never created over the web while the store is empty: there is no setup route and no public sign-up, so a freshly deployed URL cannot be claimed by whoever reaches it first. The first admin is created on the host, with the CLI (`protobase users create you@example.com --generate-password`) or from code:

```ts
import { createUser, hasUsers, listUsers } from '@protobase/server'

await createUser(auth, { email, password, name?, role? })  // the first user is always an admin; later ones default to `user`
await hasUsers(auth)                                         // boolean
await listUsers(auth)                                        // [{ id, email, role, banned, createdAt }], never passwords
await setUserRole(auth, { email, role })                     // 'admin' | 'user'
await setUserBanned(auth, { email, banned })                 // banning ends the user's sessions and blocks sign-in
await deleteUser(auth, email)                                // with sessions and accounts
```

The last active admin cannot be deleted, demoted or banned: those functions throw instead, so every caller is protected. An account created by `createUser` or an admin counts as having a verified address, since whoever created it vouches for it; that lets it sign in with an [emailed code](#emailed-sign-in-codes).

Until a user exists sign-in fails, and `GET /api/auth/status` (public) answers `{ "needsAdmin": true, "signInMethods": ["password", "passkey"], "passwordReset": false, "socialProviders": [] }` so a login page can say what to do. `signInMethods` lists the ways to sign in the [sign-in policy](#sign-in-policy) leaves on (`password`, `emailCode`, `passkey`), `passwordReset` is whether [reset mail](#password-reset) can be sent and passwords are on, and `staffSignIn`, when there, names the provider of [staff sign-in](#staff-sign-in). Further users are created by an admin with Better Auth's `POST /api/auth/admin/create-user`, or with `createUser` on the host. The auth store holds a connection pool; scripts that call these functions end the process themselves.

## Password reset

With mail configured, the sign-in page offers "Forgot password?": the person enters their email, gets a link, and chooses a new password on the page the link opens. It is Better Auth's own reset: `POST /api/auth/request-password-reset` with `{ email, redirectTo }`, the emailed link `GET /api/auth/reset-password/<token>`, which sends the browser back to `redirectTo` with `?token=...` (or `?error=INVALID_TOKEN`), and `POST /api/auth/reset-password` with `{ token, newPassword }`.

```sh
PROTOBASE_SMTP_URL=smtps://user:password@smtp.example.com:465   # or smtp://...:587, STARTTLS when the server offers it
PROTOBASE_MAIL_FROM=noreply@admin.example.com
```

`createAuth` reads both from the environment; the platform passes them, like `DATABASE_URL`. Set both or neither: one without the other, a URL that is not `smtp://` or `smtps://`, or a sender that is not a plain address stops `createAuth` with an error. Without them reset is off: `GET /api/auth/status` says `"passwordReset": false`, the page shows no link, and a reset request answers `400` (`RESET_PASSWORD_DISABLED`). A project can send the mail itself instead, or turn reset off whatever the environment says:

```ts
createAuth({ ..., mailer: { send: async ({ to, subject, text }) => { /* deliver it */ } } })
createAuth({ ..., mailer: false })
```

- The email is plain text: the link, that it works for 1 hour and once, and that it can be ignored.
- The SMTP client greets the server with the sender's domain (`admin.example.com` above), not the container's `[127.0.0.1]`; a `?name=` on `PROTOBASE_SMTP_URL` overrides it.
- A request answers the same whether or not the address has an account, and the mail goes out after the answer, so neither the response nor its timing tells. A send that fails is logged by Better Auth.
- Requests are limited to 3 per minute and client. Setting a new password ends all of the user's sessions; the new password needs 12 characters like any other.
- `redirectTo` must be on a trusted origin (`BETTER_AUTH_URL` or `TRUSTED_ORIGINS`); the admin app sends its own page with a `password-reset` marker, so the link opens the set-password page there.
- While the [sign-in policy](#sign-in-policy) turns passwords off, reset is off too (`403`).

## Emailed sign-in codes

With mail configured, the sign-in page offers "Email me a sign-in code": the person enters their address, gets a 6-digit code, and signs in with it instead of a password. It is Better Auth's [email OTP](https://www.better-auth.com/docs/plugins/email-otp) plugin: `POST /api/auth/email-otp/send-verification-otp` with `{ email, type: "sign-in" }`, then `POST /api/auth/sign-in/email-otp` with `{ email, otp }`.

- A code works for 5 minutes, once, and three wrong tries end it; asking again sends a new one and the old one stops working. Codes are stored hashed.
- It never creates an account: an unknown address gets no mail, and the answer is the same either way.
- Only sign-in codes are mailed. The plugin's own email verification, password reset and address change endpoints are off (`404`), and asking for another type of code answers `400`.
- An account with [two-factor authentication](#two-factor-authentication) is asked for its second step after the code too, as after a password.
- An account created by Protobase 0.3 or earlier, which has a password, is marked verified the first time it uses a code. Otherwise Better Auth would treat the code as taking over an unverified account and delete its password.

## Passkeys

People add passkeys (Face ID, Touch ID, Windows Hello, a phone or a security key) on their account page, and sign in with "Sign in with a passkey". It is Better Auth's [passkey](https://www.better-auth.com/docs/plugins/passkey) plugin from `@better-auth/passkey`, under `/api/auth/passkey/*`.

- A passkey belongs to the host of `BETTER_AUTH_URL`: one added on `admin.example.com` works there only. For local development, `http://localhost` works.
- A passkey sign-in asks for no second step: the passkey is something you have and something you are or know.
- Adding a passkey needs a session started in the last day; after that, the page asks to sign in again first.
- Passkeys can be renamed and removed on the account page; removing one here leaves it on the device.

## Two-factor authentication

On their account page, people turn on a second step after a password or an emailed sign-in code, with Better Auth's [two-factor](https://www.better-auth.com/docs/plugins/2fa) plugin:

- **Authenticator app:** the page shows a QR code (and the key, to type in), the person confirms it with a code from the app, and gets ten backup codes that each work once instead of a code. New backup codes replace the old ones.
- **Emailed code:** with mail configured, a 6-digit code mailed at each sign-in, valid for 5 minutes. An account with an app can also choose an emailed code at sign-in. Backup codes come with the app only.

Turning it on, off, or making new backup codes asks for the account's password when it has one. At sign-in, a correct password or code answers `{ "twoFactorRedirect": true, "twoFactorMethods": ["totp", "otp"] }` instead of a session, and `POST /api/auth/two-factor/verify-totp`, `verify-otp` or `verify-backup-code` with `{ code, trustDevice? }` finishes it; `trustDevice` skips the step in that browser for 30 days. Ten wrong codes in a row lock the account's second step for 15 minutes.

Sign-in with GitHub or another [provider](#sign-in-with-github) is not asked for the second step.

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

The server stores the policy in the `sign_in_policy` table, one row per save (the newest applies, the others are its history, with who saved each and when), and applies it to Better Auth's endpoints; the pages only show what it allows.

- **Off:** the server refuses the method with `403` (`SIGN_IN_METHOD_FORBIDDEN`) and the sign-in page leaves it out. Passkeys off also stops adding them; two-factor off stops turning it on, while those who have it keep being asked until they turn it off.
- **Required:** someone who signs in without it is sent to set it up first. The server holds back API tokens until then (`GET /api/auth/token` answers `403`, `SIGN_IN_SETUP_REQUIRED`), and refuses to turn two-factor authentication off or to remove the last passkey.
- Signed-in people keep their session after a change; a newly required method is asked for at their next token refresh, within 15 minutes.
- **Staff sign-in as a person** shows only with an [operator provider](#operator-provider). Off refuses [staff sign-in](#staff-sign-in) (`403`, `SIGN_IN_METHOD_FORBIDDEN`); Email the person mails the person each time, and needs mail: without it the server refuses to save it, and a saved one turns staff sign-in off until mail is back.
- **Sign in with ... through the platform** shows only with a [platform sign-in provider](#platform-sign-in-provider). Off refuses starting, finishing and connecting it (`403`, `SIGN_IN_METHOD_FORBIDDEN`) and the sign-in page leaves it out. It applies as Off while passkeys or two-factor authentication are Required: a provider's sign-in skips the app's second step, and the provider's own cannot be checked.

The server refuses a policy (`400`, `SIGN_IN_POLICY_REFUSED`, with the reason) that would lock people out: passwords and emailed codes both off (someone without a passkey could not sign in), passwords off without mail, two-factor authentication required with passwords off (turning it on asks for the password), or a policy the saving admin could not sign in with. Emailed codes need mail: without `PROTOBASE_SMTP_URL` they are off whatever the policy says, and so that a policy saved with mail cannot lock everyone out once mail goes away, password sign-in is then on as well.

The endpoints, for admins: `GET /api/auth/policy/sign-in` answers `{ policy, effective, mail, operator?, platformSignIn?, savedAt?, savedBy? }` (`effective` is the policy as it applies now, `operator` the operator provider's name, `platformSignIn` the platform sign-in provider's), and `POST /api/auth/policy/sign-in` with `{ password, emailCode, passkey, twoFactor, staffAccess, platformSignIn }` saves one. `GET /api/auth/account/sign-in-methods` tells the signed-in user the policy, what their account has (`password`, `passkeys`, `twoFactor`, `authenticatorApp`) and what it still has to set up (`missing`).

Sign-in providers the project configures in code, such as its own GitHub app, are not covered by the policy; the one the platform adds is. Neither are roles: the policy is the same for everyone.

## Staff sign-in

The team that runs an app (the operator: Protobase Cloud, or whoever hosts it) can sign in as one of its people to help them, without their password and without the app's keys leaving the app. Staff sign in with the operator's own identity provider, and the app trusts that provider for this alone: it never creates an account for them.

1. Staff open the app with `?staff-sign-in`, for example `https://admin.example.com/?staff-sign-in&email=sanne@example.com&reason=Ticket+4211`, from a support tool or by hand. The page asks for the person's address and a reason, at least 10 characters.
2. "Continue with ..." sends them to the operator provider, where they sign in.
3. The provider sends them back to the app, signed in as the person, with a banner across the top: who is signed in as whom, why, until when, and "Stop staff session". A refusal comes back to the same page with the reason.

The guardrails:

- **Permission:** the ID token's `groups` claim must hold the configured group (default `protobase-staff-access`).
- **A strong, recent sign-in:** the provider must report a passkey or a second step (`amr` with `mfa`, `hwk` or `swk`, or an `acr` from `acrValues`), at most 15 minutes old (`auth_time`; the app asks with `max_age`). The person's own two-factor and passkey requirements do not apply to staff.
- **A reason**, kept in the log with who signed in as whom.
- **Short and stoppable:** the session lasts 30 minutes (`sessionMinutes`, at most 240), is never extended, ends with the browser, and "Stop staff session" (`POST /api/auth/staff/stop`) ends it and signs the browser out. An API token it got before keeps working until it expires, at most 15 minutes later, like any other.
- **No takeover:** a staff session cannot change the person's password, email, passkeys, two-factor authentication or sessions, nor save the sign-in policy (`403`, `STAFF_CANNOT_CHANGE_SIGN_IN`).
- **The app decides:** admins turn staff sign-in off, or have the person emailed each time, with the [sign-in policy](#sign-in-policy).
- **One way in:** Better Auth's own `/admin/impersonate-user` and `/admin/stop-impersonating` are off (`404`), so app admins cannot sign in as their people.
- The start is limited to 5 per minute and client; only the browser that started a sign-in can finish it, within 10 minutes and once; and the page it comes back to must be on a trusted origin.

Admins find the log under the policy on the **Sign-in policy** page: each staff sign-in with the staff member, the person, the reason, and when it started and ended. It is the `staff_sign_in` table, and `GET /api/auth/staff/sign-ins` (admins) answers `{ signIns }`, newest first. A staff session is a session of Better Auth's admin plugin with `impersonatedBy` set to the staff member's address; `GET /api/auth/staff/session` answers `{ staff }` for it (`null` otherwise), which the banner shows.

### Operator provider

Any OpenID Connect provider works. Register the app with it as a confidential client:

- Redirect URI: `<BETTER_AUTH_URL>/api/auth/staff/callback`.
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

Set the first three together or none: some but not all of them stops `createAuth` with an error. In code, `operator` takes the same settings and a few more, and `false` turns staff sign-in off whatever the environment says:

```ts
createAuth({ ..., operator: { issuer, clientId, clientSecret, name: 'Support', group: 'support-leads', scopes: ['groups'], acrValues: ['gold'], sessionMinutes: 15 } })
createAuth({ ..., operator: false })
```

`scopes` adds scopes for a provider that puts `groups` in the ID token only for a scope of its own (Okta's `groups`, for example), and `acrValues` names the levels that count as a strong sign-in for a provider that reports `acr` instead of `amr` (Keycloak's levels of assurance, for example); the app then asks for them with `acr_values`. `GET /api/auth/status` names the provider as `staffSignIn` while staff can sign in.

## Sign-in with GitHub

Projects have no sign-in provider of their own by default (a platform can add [one](#platform-sign-in-provider)). `socialProviders` adds Better Auth's [social providers](https://www.better-auth.com/docs/authentication/github), and the sign-in page shows "Continue with GitHub" when `github` is one:

```ts
createAuth({ ..., socialProviders: { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! } } })
```

- The callback URL to register with GitHub is `<BETTER_AUTH_URL>/api/auth/callback/github`. A GitHub App needs the Email addresses (read-only) account permission, or sign-in fails with `email_not_found`.
- A provider is also a public sign-up: someone without an account gets one with the [default role](#roles). Without a default role the sign-up is refused.
- `GET /api/auth/status` lists the provider ids as `socialProviders`.
- `encryptOAuthTokens: true` stores the provider's access, refresh and ID tokens encrypted with the secret.
- `onUserCreated: async (user, ctx) => { ... }` runs after any user is created, a social sign-up included (Better Auth's `databaseHooks.user.create.after`; the type is `UserCreatedHook`).

### Sign-in links and connected accounts

These work for every provider, the project's own and the [platform's](#platform-sign-in-provider):

- **Sign-in links:** `https://<app>/?sign-in=github` starts signing in with `github` at once, showing only "Signing in with GitHub" while the browser leaves, so someone the provider knows lands signed in without a sign-in page. A refusal comes back to the sign-in page with the reason (`?error=<code>`, for example `signup_disabled`), and does not start again. Someone signed in already just opens the app.
- **Connected accounts:** the **Sign-in & security** page lists the providers and offers "Connect GitHub" for one the account is not linked to. Connecting signs in at the provider and links that account whatever its address (`accountLinking.allowDifferentEmails`, which applies only to this explicit link by someone signed in). A provider account linked to another person already is refused (`account_already_linked_to_different_user`); a [staff session](#staff-sign-in) cannot link.
- **Linked up front:** `protobase users create <email> --github-id <id>`, or `createUser(auth, { ..., accounts: [{ providerId: 'github', accountId }] })`, links a new user to a GitHub user id, so GitHub finds them by it whatever address it reports.
- Without a link, a provider finds someone by address only when it vouches for the address (`email_verified`) and the account's address is verified; accounts created by an admin or on the host are.

## Platform sign-in provider

A platform that hosts the app can add a sign-in provider for the people who have an account in it: any OpenID Connect provider, passed in the environment. Protobase Cloud passes its own, so people sign in with GitHub through the Protobase GitHub App; a self-hosted app passes [Dex, Keycloak](#self-hosting-with-dex-or-keycloak) or the like.

```sh
PROTOBASE_SIGN_IN_ISSUER=https://auth.example.com     # its discovery is <issuer>/.well-known/openid-configuration
PROTOBASE_SIGN_IN_CLIENT_ID=erp-example-com
PROTOBASE_SIGN_IN_CLIENT_SECRET=...
PROTOBASE_SIGN_IN_PROVIDER=oidc                       # the default; the button, the callback and the namespace of the links
PROTOBASE_SIGN_IN_NAME="Acme SSO"                      # shown as "Continue with Acme SSO"; default GitHub for github, SSO otherwise
```

Register the app with the provider as a confidential client with the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/<provider>` (`/api/auth/callback/oidc` by default). The app authenticates with its secret (`client_secret_basic`) and PKCE (`S256`), asks for `openid email profile`, and takes the person from the ID token only, verified against the provider's JWKS, the issuer, the client and the nonce. The provider needs no userinfo endpoint.

- **No sign-up:** someone without an account is refused (`signup_disabled`); admins add people as before. A provider the project did not choose never opens the app to new people.
- **The project's own provider wins:** with `socialProviders.github` in code and `PROTOBASE_SIGN_IN_PROVIDER=github`, the project's GitHub app handles the sign-in and the platform's is left out.
- **The provider id:** set `PROTOBASE_SIGN_IN_PROVIDER=github` only when the provider's `sub` is the GitHub user id, as Protobase Cloud's is. Its links are then those of Better Auth's own GitHub provider, so an app that later brings its own GitHub app keeps every person's link. Dex's and Keycloak's `sub` is their own id, so keep the default `oidc` for them.
- **Startup:** the provider's settings are read when the app starts; when they cannot be, the provider is left out until the next start (the status and sign-in page do not offer it) and every other way to sign in works.
- The [sign-in policy](#sign-in-policy) has a row for it, and `GET /api/auth/status` names it as `platformSignIn: { provider, name }` besides listing it in `socialProviders`.

Set the first three together or none: some but not all of them stops `createAuth` with an error. In code, `signInProvider` takes the same settings and `scopes`, and `false` turns it off whatever the environment says:

```ts
createAuth({ ..., signInProvider: { issuer, clientId, clientSecret, provider: 'oidc', name: 'Acme SSO', scopes: ['groups'] } })
createAuth({ ..., signInProvider: false })
```

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

People sign in with the address their account here has, or connect the provider on the Sign-in & security page once.

## Roles

The roles are a project setting: `createAuth({ ..., roles: ['admin', 'auditor', 'sales', 'accountant'] })`. `admin` is always included and first; the default is `['admin', 'user']`. Names are lowercase letters, digits, `_` and `-`. `defaultRole` is what a new user gets when no role is given. Without it, and with more than one role besides `admin`, creating a user without a role is an error that lists the choices (the CLI then needs `--role`); with exactly one other role, that role is the default. `auth.defaultRole` is `undefined` when a role must be chosen. A user can hold several roles (`setUserRole(auth, { email, role: 'sales,accountant' })`).

`createUser`, `setUserRole` and Better Auth's own admin endpoints refuse a role outside the list. `roleChoices(auth)` returns the list, for the CLI's `users set-role` and for UIs. Only `admin` gains Better Auth admin-plugin permissions (managing users); every other role is for your access rules, which see them as `ctx.user.roles`. Besides `admin`, the role `ai` opens the [assistant](/reference/assistant/#who-sees-it) when the project lists it.

## Tokens and roles

Sign in at `POST /api/auth/sign-in/email` (or with a code or passkey), then `GET /api/auth/token` (with the session cookie) returns `{ token }`, an EdDSA JWT valid for 15 minutes, unless the [sign-in policy](#sign-in-policy) requires something the account has not set up; the keys are at `/api/auth/jwks`. Send it as `Authorization: Bearer <token>`. `/token` is the only way to a token in the browser: the `set-auth-jwt` header of Better Auth's JWT plugin is off.

`betterAuthAuthenticator` maps the claims to a session: `sub` is the user id, `roles` come from the `role` claim, which is the admin plugin's `role` column on the user (a comma separated string; the first user is always `admin`). Access rules see them as `ctx.user.roles`. The tenant is the configured `tenant` option, never a claim, until organizations are supported. The key set is cached in memory: read once, again every 10 minutes (so removed keys stop being accepted), and again when a token names an unknown `kid` (a rotated key), at most once per 30 seconds however many such tokens arrive (`cache: { refreshMs, minReloadMs }`). Pass `jwksUrl` and `issuer` instead of `auth` when the API runs apart from the auth server.

`jwtAuthenticator` accepts asymmetric signature algorithms only unless you pass `algorithms` explicitly (the tests do, for HS256), so a token cannot be forged with a public key used as an HMAC secret; Better Auth signs with its own key pair and publishes the public keys at `/api/auth/jwks`. An expired, tampered, wrongly signed or missing token is a `401` problem with `WWW-Authenticate: Bearer`.

## Tokens for scripts and curl

There is no development login. For scripts, mint a token for an existing user on the host (the CLI exposes it as `protobase token you@example.com`):

```ts
import { issueToken } from '@protobase/server'

const { token, expiresAt } = await issueToken(auth, { email: 'you@example.com', ttlSeconds: 3600 }) // default 15 minutes, at most 24 hours
```

It is signed with the same keys and carries the same claims as a token from `/api/auth/token`, so the API treats it as any other. Banned and unknown users get an error. There is no HTTP route for this.

## Public endpoints

Only the Better Auth routes under `/api/auth/*` (sign-in, password reset, the start and callback of a [staff sign-in](#staff-sign-in) and the like) and `GET /api/auth/status` are reachable without a token; the account, policy and staff session endpoints there need a session. The API (`/api/v1/*`) and the system endpoints (`/api/meta`, `/api/openapi.json`, `/api/docs`) all answer `401` without one.

## Roles and access in the API

Roles are bundles of capabilities (`defineRoles` in `@protobase/schema`: `orders.read.own`, `costs.read`, `*.read`, ...). Pass the result as `options.roles` to `createAdmin`, and every operation without an explicit rule needs the matching capability. The token's `roles` become `ctx.user.roles` in rules; the user id (`sub`) is what `.own` compares with the resource's `.owner(...)` field, so it must be the id that field stores. How the API enforces them (hidden fields, row filters, record permissions) is in [the REST API reference](/reference/api/#access).
