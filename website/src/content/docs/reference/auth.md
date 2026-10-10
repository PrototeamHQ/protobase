---
title: Login with Better Auth
description: Sign-in with Better Auth, with the admin store, sign-in methods and policy, roles, tokens and the public endpoints.
---

`@protobase/server` ships a [Better Auth](https://www.better-auth.com) setup (version 1.7): sign-in with a password, an [emailed code](#emailed-sign-in-codes) or a [passkey](#passkeys), [two-factor authentication](#two-factor-authentication), a [sign-in policy](#sign-in-policy) admins set in the app, roles, and short-lived JWTs that the API verifies against Better Auth's own JWKS. All of it is Better Auth's own plugins (`emailOTP`, `twoFactor`, `@better-auth/passkey`), wired by `createAuth`.

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

```sh
bun run --cwd examples/erp auth:migrate    # creates the auth schema and Better Auth's tables; needs only a role that owns the database; safe to repeat
```

Run it again after upgrading Protobase, before the new version serves: a release can add tables and columns to the store, and Better Auth refuses every request while the store is behind (`500`, logging "Database schema mismatch"). The migration only adds. The sign-in methods below added the `twoFactor`, `passkey` and `signInPolicy` tables and a `twoFactorEnabled` column on `user`; existing users keep signing in with their password.

`ADMIN_DATABASE_URL` puts the `auth` schema in another database instead of `DATABASE_URL`'s. `createAuth` takes a `pg` Pool or `{ dialect, type: 'postgres', schemaName? }` as `database`; without `schemaName` the tables go to the connection's `search_path` (usually `public`).

## Configuration

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET` | signs cookies and encrypts the token keys; `openssl rand -base64 32`; never committed (`.env.example` has a placeholder) |
| `BETTER_AUTH_URL` | public URL of the API (default `http://localhost:5173`); issuer and audience of the tokens; when tunnelling, the https tunnel URL |
| `TRUSTED_ORIGINS` | extra comma separated origins; `https://*.trycloudflare.com` is always trusted |
| `PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM` | the mail server and sender for [password reset](#password-reset), [emailed sign-in codes](#emailed-sign-in-codes) and emailed [two-factor](#two-factor-authentication) codes, passed by the platform; all three are off without them |

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

Until a user exists sign-in fails, and `GET /api/auth/status` (public) answers `{ "needsAdmin": true, "signInMethods": ["password", "passkey"], "passwordReset": false, "socialProviders": [] }` so a login page can say what to do. `signInMethods` lists the ways to sign in the [sign-in policy](#sign-in-policy) leaves on (`password`, `emailCode`, `passkey`), and `passwordReset` is whether [reset mail](#password-reset) can be sent and passwords are on. Further users are created by an admin with Better Auth's `POST /api/auth/admin/create-user`, or with `createUser` on the host. The auth store holds a connection pool; scripts that call these functions end the process themselves.

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

The server stores the policy in the `signInPolicy` table, one row per save (the newest applies, the others are its history, with who saved each and when), and applies it to Better Auth's endpoints; the pages only show what it allows.

- **Off:** the server refuses the method with `403` (`SIGN_IN_METHOD_FORBIDDEN`) and the sign-in page leaves it out. Passkeys off also stops adding them; two-factor off stops turning it on, while those who have it keep being asked until they turn it off.
- **Required:** someone who signs in without it is sent to set it up first. The server holds back API tokens until then (`GET /api/auth/token` answers `403`, `SIGN_IN_SETUP_REQUIRED`), and refuses to turn two-factor authentication off or to remove the last passkey.
- Signed-in people keep their session after a change; a newly required method is asked for at their next token refresh, within 15 minutes.

The server refuses a policy (`400`, `SIGN_IN_POLICY_REFUSED`, with the reason) that would lock people out: passwords and emailed codes both off (someone without a passkey could not sign in), passwords off without mail, two-factor authentication required with passwords off (turning it on asks for the password), or a policy the saving admin could not sign in with. Emailed codes need mail: without `PROTOBASE_SMTP_URL` they are off whatever the policy says, and so that a policy saved with mail cannot lock everyone out once mail goes away, password sign-in is then on as well.

The endpoints, for admins: `GET /api/auth/policy/sign-in` answers `{ policy, effective, mail, savedAt?, savedBy? }` (`effective` is the policy as it applies now), and `POST /api/auth/policy/sign-in` with `{ password, emailCode, passkey, twoFactor }` saves one. `GET /api/auth/account/sign-in-methods` tells the signed-in user the policy, what their account has (`password`, `passkeys`, `twoFactor`, `authenticatorApp`) and what it still has to set up (`missing`).

Sign-in providers such as GitHub are configured in code and not covered by the policy; neither are roles: the policy is the same for everyone.

## Sign-in with GitHub

Projects have no sign-in provider by default. `socialProviders` adds Better Auth's [social providers](https://www.better-auth.com/docs/authentication/github), and the sign-in page shows "Continue with GitHub" when `github` is one:

```ts
createAuth({ ..., socialProviders: { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! } } })
```

- The callback URL to register with GitHub is `<BETTER_AUTH_URL>/api/auth/callback/github`. A GitHub App needs the Email addresses (read-only) account permission, or sign-in fails with `email_not_found`.
- A provider is also a public sign-up: someone without an account gets one with the [default role](#roles). Without a default role the sign-up is refused.
- `GET /api/auth/status` lists the provider ids as `socialProviders`.
- `encryptOAuthTokens: true` stores the provider's access, refresh and ID tokens encrypted with the secret.
- `onUserCreated: async (user, ctx) => { ... }` runs after any user is created, a social sign-up included (Better Auth's `databaseHooks.user.create.after`; the type is `UserCreatedHook`).

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

Only the Better Auth routes under `/api/auth/*` (sign-in, password reset and the like) and `GET /api/auth/status` are reachable without a token; the account and policy endpoints there need a session. The API (`/api/v1/*`) and the system endpoints (`/api/meta`, `/api/openapi.json`, `/api/docs`) all answer `401` without one.

## Roles and access in the API

Roles are bundles of capabilities (`defineRoles` in `@protobase/schema`: `orders.read.own`, `costs.read`, `*.read`, ...). Pass the result as `options.roles` to `createAdmin`, and every operation without an explicit rule needs the matching capability. The token's `roles` become `ctx.user.roles` in rules; the user id (`sub`) is what `.own` compares with the resource's `.owner(...)` field, so it must be the id that field stores. How the API enforces them (hidden fields, row filters, record permissions) is in [the REST API reference](/reference/api/#access).
