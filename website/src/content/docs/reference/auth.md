---
title: Login with Better Auth
description: Sign-in with Better Auth, with the admin store, sign-in methods and policy, sign-in providers, staff sign-in, roles, tokens and the public endpoints.
---

`@protobase/server` ships a [Better Auth](https://www.better-auth.com) setup (version 1.7): sign-in with a password, an [emailed code](#emailed-sign-in-codes) or a [passkey](#passkeys), [two-factor authentication](#two-factor-authentication), a [sign-in policy](#sign-in-policy) admins set in the app, [staff sign-in](#staff-sign-in) for the team that runs the app, [SAML single sign-on](#sign-in-with-saml), roles, and short-lived JWTs that the API verifies against Better Auth's own JWKS, and, when turned on, [organizations](#organizations) people work in one at a time. All of it is Better Auth's own plugins (`emailOTP`, `twoFactor`, `@better-auth/passkey`, `@better-auth/sso`), wired by `createAuth`.

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

Build that pool as `handleDroppedConnections(new pg.Pool(...))` (from `@protobase/server`) so a database restart is printed instead of stopping the app.

### Migrations

The store's tables are part of the project's migrations, committed in the repository like the application's own: the examples carry them as `db/migrations/*_auth.sql`, and their `db:migrate` applies both. When an upgrade of Protobase (or another Better Auth plugin) needs more tables or columns, write the change as the project's next migration:

```sh
bun run db:migrate                  # the database at the project's current schema
bun run protobase auth migration    # compares it with what Better Auth needs; writes db/migrations/NNN_auth.sql
bun run db:migrate                  # applies it
```

The file only adds tables, columns and indexes, never drops one, and is plain SQL to review, edit or leave out where the project handles the auth schema itself. `--dir` and `--name` choose the folder and the name after the number. [`protobase migration`](/reference/cli/#migration) writes the same file, along with what the config's other features need, such as [jobs](/reference/jobs/).

The store's tables and columns are snake_case, like the app's (`sign_in_policy.platform_sign_in`, `session.user_id`); the code and the API keep Better Auth's camelCase names. A store set up by Protobase 0.6 has Better Auth's camelCase names instead (`"signInPolicy"."platformSignIn"`): for it, `protobase auth migration` writes the migration that renames its tables, columns, indexes and constraints in place, keeping every row. The examples carry it as `db/migrations/*_auth_snake_case.sql`; on a store with the snake_case names it does nothing.

The server never changes the schema. `protobase serve` and `protobase dev` read it at startup and refuse to start while it lacks a table or column Better Auth needs, naming them and `protobase auth migration`; without that check every sign-in would fail (`500`, "Database schema mismatch"). The examples' `db:migrate` applies all pending files in one transaction, so a migration that fails leaves the database as the running version expects it. The host must guarantee the rest: nothing but the migrations writes while they run, and the new version serves only after they succeeded.

Upgrading from 0.5 or earlier, where `auth:migrate` created the tables, goes through 0.6. With Protobase 0.6, run `protobase auth migration` twice, once with `DATABASE_URL` on an empty database with only the project's own migrations applied (it writes the whole store), then on the project's database (it writes what this version adds). Every statement skips what exists already, so both files apply to new databases and to those `auth:migrate` set up. The `auth:migrate` script and `db/auth-migrate.ts` can then go, and the upgrade goes on as from 0.6.

`createAuth` takes a `pg` Pool or `{ dialect, type: 'postgres', schemaName? }` as `database`; without `schemaName` the tables go to the connection's `search_path` (usually `public`). The examples keep the store in the `auth` schema of `DATABASE_URL`'s database, so their migrations cover both.

### An existing users table

The store can use a users table another system made, such as Supabase's `auth.users`, so its rows keep signing in and every foreign key, trigger and function that names the table keeps working:

```ts
createAuth({
  database: { dialect, type: 'postgres', schemaName: 'auth' },
  users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' },
  passwordHashes: ['bcrypt'],
  generateUserId: 'uuid',
  ...
})
```

- `users.table` names the table, default `user`. `users.columns` maps a column, by the name Protobase gives it (`name`, `email`, `email_verified`, `email_confirmed_at`, `image`, `created_at`, `updated_at`, `role`, `banned`, `ban_reason`, `ban_expires`, `two_factor_enabled`, `last_role`, `last_organization_id`), to the table's own; here the app's roles go to `app_role`, since Supabase's `role` holds the Postgres role. The other tables keep their names and point at this one.
- `users.metadata` names a JSON column for each user's metadata: `createUser(auth, { ..., metadata: { full_name: 'Carol' } })` writes it, so a trigger that reads `raw_user_meta_data->>'full_name'` sees it.
- `passwordHashes: ['bcrypt']` also verifies bcrypt hashes (`$2a$`, `$2b$`, `$2y$`), and stores the password again as Better Auth's own scrypt after its first sign-in. The 12-character minimum holds for new passwords only, so a shorter existing one still signs in.
- `generateUserId: 'uuid'` makes each new user's id a random UUID in the server, for a table whose `id` is a `uuid` without a default, and makes every id column of the other tables a `uuid` too.

The columns Better Auth needs that the table lacks, filled from what the other system recorded, and each password's `credential` row in `account`, come first, from a migration of the project's own; `protobase auth migration` then writes the other tables next to it.

## Configuration

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET` | signs cookies and encrypts the token keys; `openssl rand -base64 32`; never committed (`.env.example` has a placeholder) |
| `BETTER_AUTH_URL` | public URL of the API (default `http://localhost:5173`); issuer and audience of the tokens; when tunnelling, the https tunnel URL |
| `TRUSTED_ORIGINS` | extra comma separated origins; a dev tunnel needs its exact host here, such as `https://my-tunnel.trycloudflare.com`, since no wildcard is trusted |
| `PROTOBASE_ORIGINS` | the other origins the app is served on, comma separated, passed by the platform; see [Several origins](#several-origins) |
| `PROTOBASE_PASSKEY_DOMAIN` | the host new [passkeys](#passkeys) are made for, passed by the platform; default the host of `BETTER_AUTH_URL` |
| `PROTOBASE_CORS_ORIGINS` | other websites whose browser code may call the API, `*` or comma separated http and https origins, passed by the platform; see [CORS](/reference/api/#cors) |
| `PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM` | the mail server and sender for [password reset](#password-reset), [emailed sign-in codes](#emailed-sign-in-codes), emailed [two-factor](#two-factor-authentication) codes and [open sign-up](#open-sign-up), passed by the platform; all four are off without them |
| `PROTOBASE_APP_NAME` | the app's name, passed by the platform: it overrides `appName` |
| `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID`, `PROTOBASE_SIGN_IN_CLIENT_SECRET` | the [platform sign-in provider](#platform-sign-in-provider) for people who have an account, passed by the platform; off without them. `PROTOBASE_SIGN_IN_PROVIDER` and `PROTOBASE_SIGN_IN_NAME` are optional |
| `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID`, `PROTOBASE_OPERATOR_CLIENT_SECRET` | the [operator provider](#operator-provider) its staff sign in with to sign in as people, passed by the platform; staff sign-in is off without them. `PROTOBASE_OPERATOR_NAME` and `PROTOBASE_OPERATOR_GROUP` are optional |
| `PROTOBASE_TRUSTED_PROXIES` | the proxies in front of `protobase serve`, addresses or CIDR ranges, comma separated, such as `172.16.0.0/12`; see [Client addresses](#client-addresses) |

- Cookies are `SameSite=Lax`, and `Secure` when `BETTER_AUTH_URL` is https.
- Sign-in is rate limited (5 password attempts per minute and client by default, `signInPerMinute`, which also limits [sign-up](#open-sign-up) requests; 3 per minute for emailed codes); [Client addresses](#client-addresses) says how a client is known.
- New passwords need at least 12 characters.
- `appName` is the app's name: authenticator apps and passkey prompts show it, the admin app's sidebar shows it at the top beside the app's [icon](/reference/app-identity/#the-icons), else Protobase's mark (Protobase's wordmark when it is `Protobase`), every browser tab of the admin app ends its title with it, the [installed app](/reference/installable-app/) is called by it, the [auth emails](/reference/email/#protobases-own-mail) name the app with it, and the platform's mailer sends them as it (the sender's display name). `PROTOBASE_APP_NAME`, when set, overrides it; without either it is `Protobase`, then without a display name. See [App identity](/reference/app-identity/).

### Client addresses

The rate limits count each client address on its own: an IPv4 address, or an IPv6 address by its /64. `protobase serve` and the runtime image find it themselves and pass it on in `X-Forwarded-For`, replacing whatever the client sent:

- Without `PROTOBASE_TRUSTED_PROXIES`, the client is the address the connection comes from. That fits a server the clients reach directly, such as `docker run -p 8787:8787`.
- Behind a reverse proxy (Caddy, nginx, Traefik, a load balancer), every connection comes from the proxy, so every client would share its one limit, and three emailed codes a minute from anyone would stop everyone signing in. Set `PROTOBASE_TRUSTED_PROXIES` to the proxy's address, or the range it connects from, such as `172.16.0.0/12` for a Docker network, and have the proxy append the address it took the request from to `X-Forwarded-For` (Caddy and Traefik do by default, nginx with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`). The client is then the rightmost address in it that is not a trusted proxy, so one the client wrote itself counts for nothing. Behind several proxies, such as a CDN in front of Caddy, trust them all.

An app served another way than `protobase serve`, such as its own server around `createAdmin`, gets what its server passes: the limits read `X-Forwarded-For` holding one address, and requests without one share a single limit.

## First run

Accounts are never created over the web while the store is empty: there is no setup route, and [open sign-up](#open-sign-up), when an app turns it on, waits for the first admin, so a freshly deployed URL cannot be claimed by whoever reaches it first. The first admin is created on the host, with the CLI (`protobase users create you@example.com --generate-password`, or `--no-password` for an account that signs in by emailed code, passkey or a sign-in provider only) or from code:

```ts
import { createUser, hasUsers, listUsers } from '@protobase/server'

await createUser(auth, { email, password?, name?, role? }) // the first user is always an admin; later ones default to `user`
await hasUsers(auth)                                         // boolean
await listUsers(auth)                                        // [{ id, email, role, banned, createdAt }], never passwords
await setUserRole(auth, { email, role })                     // 'admin' | 'user'
await setUserBanned(auth, { email, banned })                 // banning ends the user's sessions and blocks sign-in
await deleteUser(auth, email)                                // with sessions and accounts
```

The last active admin cannot be deleted, demoted or banned: those functions throw instead, and Better Auth's admin endpoints answer `400 LAST_ADMIN`, so every caller is protected. An account created by `createUser` or an admin counts as having a verified address, since whoever created it vouches for it; that lets it sign in with an [emailed code](#emailed-sign-in-codes).

Until a user exists sign-in fails, and `GET /api/auth/status` (public) answers `{ "needsAdmin": true, "signInMethods": ["password", "passkey"], "passwordReset": false, "socialProviders": [] }` so a login page can say what to do. `signInMethods` lists the ways to sign in the [sign-in policy](#sign-in-policy) leaves on (`password`, `emailCode`, `passkey`), `passwordReset` is whether [reset mail](#password-reset) can be sent and passwords are on, `signUp`, when there, says anyone can [make an account](#open-sign-up), and `staffSignIn`, when there, names the provider of [staff sign-in](#staff-sign-in). Further users are created by an admin on the [Users page](#users-page), or with `createUser` on the host. The auth store holds a connection pool; scripts that call these functions end the process themselves.

## Users page

Admins manage accounts without the command line on the Users page, an ordinary [composed page](/reference/layouts/) the config imports: everyone who can sign in, found by address, with their roles to tick, Block and Unblock, inviting someone by email, and adding an account directly.

```ts
// config/index.ts
export { usersPage } from '@protobase/layout'      // at /accounts, for admins
// config/user-menu.ts
export const accountMenu = userMenu((m) => [m.page('accounts', { label: 'Users', icon: 'users' })])
```

New apps have it already. Leave the export out to drop it, or make a page of your own around the [`Users` block](/reference/blocks/#users). It works with or without [organizations](#organizations): an invitation to the app makes an account with the roles the admin ticked, from the same link page and sign-up as an organization's invitation, and someone with an account just signs in. Listing, creating, roles and blocking are Better Auth's admin endpoints (`/api/auth/admin/list-users`, `create-user`, `set-role`, `ban-user`, `unban-user`), whose roles go as a list; the rest are Protobase's, for admins only:

| Endpoint | Does |
| --- | --- |
| `POST /api/auth/users/invite` | `{ email, roles }`: invites an address without an account, for 7 days (`invitationDays` with organizations). Inviting it again replaces the invitation. Without a mailer the answer carries the `link` to pass on. |
| `GET /api/auth/users/invitations` | The pending invitations to the app: `{ invitations: [{ id, email, roles, expiresAt }] }`. |
| `POST /api/auth/users/invitations/cancel` | `{ id }`: revokes one, so its link stops working. |
| `GET /api/auth/users/roles` | Every role with its label, to choose from. |

An invitation to the app is a row of Better Auth's `verification` table, so it needs no table of its own. The client has these as `session.users`.

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

[Jobs](/reference/jobs/#mail) send their own mail through the same server, with `mail` in their context, and so do the app's [email templates](/reference/email/).

- The email names the app and gives the link, as a button and in its plain-text part, that it works for 1 hour and once, and that it can be ignored (see [Protobase's own mail](/reference/email/#protobases-own-mail)).
- The SMTP client greets the server with the sender's domain (`admin.example.com` above), not the container's `[127.0.0.1]`; a `?name=` on `PROTOBASE_SMTP_URL` overrides it.
- A request answers the same whether or not the address has an account, and the mail goes out after the answer, so neither the response nor its timing tells. A send that fails is logged by Better Auth.
- Requests are limited to 3 per minute and client. Setting a new password ends all of the user's sessions; the new password needs 12 characters like any other.
- `redirectTo` must be on a trusted origin (`BETTER_AUTH_URL`, one of the app's [other origins](#several-origins) or `TRUSTED_ORIGINS`); the admin app sends its own page with a `password-reset` marker, so the link opens the set-password page there.
- The link is on the origin the reset was asked on, when that is one of the app's.
- While the [sign-in policy](#sign-in-policy) turns passwords off, reset is off too (`403`).

## Emailed sign-in codes

With mail configured, the sign-in page offers "Email me a sign-in code": the person enters their address, gets a 6-digit code, and signs in with it instead of a password. It is Better Auth's [email OTP](https://www.better-auth.com/docs/plugins/email-otp) plugin: `POST /api/auth/email-otp/send-verification-otp` with `{ email, type: "sign-in" }`, then `POST /api/auth/sign-in/email-otp` with `{ email, otp }`.

- A code works for 5 minutes, once, and three wrong tries end it; asking again sends a new one and the old one stops working. Codes are stored hashed.
- It never creates an account: an unknown address gets no mail, and the answer is the same either way.
- Only sign-in codes are mailed. The plugin's own email verification, password reset and address change endpoints are off (`404`), and asking for another type of code answers `400`.
- An account with [two-factor authentication](#two-factor-authentication) is asked for its second step after the code too, as after a password.
- An account created by Protobase 0.3 or earlier, which has a password, is marked verified the first time it uses a code. Otherwise Better Auth would treat the code as taking over an unverified account and delete its password.

## Open sign-up

Off by default: accounts come from the host, an admin, an [invitation](#users-page) to the app or to an [organization](#organizations), or a [sign-in provider](#sign-in-with-github). An app where anyone may make an account, such as a public portal whose visitors save searches, turns it on with the role new accounts get:

```ts
createAuth({ ..., roles: ['admin', 'member'], signUp: { role: 'member' } })
```

The sign-in page then offers "Create an account", and so do [sign-in prompts](/reference/ui-config/#sign-in-prompts): the person enters their address, gets a 6-digit code, and enters it on a page of its own. Only once the code is right does the next page ask for their name and a password. The account is made only then, with the address verified, and signed in.

- `role` is one of `roles`, and never `admin`: `createAuth` stops with an error otherwise. Give it the least a stranger may hold; a request that names another role, or sets `role` through Better Auth's own endpoints, does not get it.
- It needs mail: without a mailer it is not offered, `GET /api/auth/status` has no `signUp`, and its endpoints answer `404`. Not with [organizations](#organizations), whose people join by invitation.
- `POST /api/auth/sign-up/send-code` with `{ email }` mails the code. It answers the same whether the address has an account or not; an address that has one is mailed a note saying so instead of a code, with a link to the sign-in page, so nobody can tell from the answer, and no second account is made.
- `POST /api/auth/sign-up/verify-code` with `{ email, code }` checks the code on its own and answers `{ ticket }`. A code works for 5 minutes, once, and three wrong tries end it; asking again sends a new one. Codes are stored hashed.
- `POST /api/auth/sign-up/create` with `{ ticket, name, password? }` makes the account for the address whose code was right, and signs in. A ticket works for 30 minutes, once, and is stored hashed; a password the policy refuses leaves it for another try. A used or expired one answers `SIGN_UP_TICKET_INVALID`, and the sign-up starts again with the address.
- The password follows the [sign-in policy](#sign-in-policy) as for an invitation: none while passwords are off, optional while emailed codes are on, 12 characters or more. What the policy requires, such as two-factor authentication, is set up after the first sign-in, as for every account.
- The three requests are limited per minute and client like sign-in (`signInPerMinute`, default 5), and refused (`NO_ADMIN_YET`) while the store has no user.
- `onUserCreated` runs for every account made this way.

## Passkeys

People add passkeys (Face ID, Touch ID, Windows Hello, a phone or a security key) on their account page, and sign in with "Sign in with a passkey". It is Better Auth's [passkey](https://www.better-auth.com/docs/plugins/passkey) plugin from `@better-auth/passkey`, under `/api/auth/passkey/*`.

- A passkey is made for the app's passkey domain, its RP ID: the host of `BETTER_AUTH_URL` (`admin.example.com`), or the host of one of its [other origins](#several-origins) set with `passkeyDomain` or `PROTOBASE_PASSKEY_DOMAIN`. For local development, `http://localhost` works.
- Each passkey keeps the RP ID it was made for (`passkey.rp_id`), so changing the passkey domain breaks none. Passkeys made before Protobase kept it count for the host of `BETTER_AUTH_URL`, which they were made for; renaming that host breaks them. The column is new in 0.10: the server refuses to start until the [migration](#migrations) that adds it is applied.
- A passkey's answer, for adding a passkey or signing in, must name the origin of `BETTER_AUTH_URL` or one of the [other origins](#several-origins) exactly. An origin listed only in `TRUSTED_ORIGINS`, such as a dev tunnel, cannot use passkeys: list it as one of the other origins instead.
- On an app with several origins, every passkey works on each of them through [Related Origin Requests](https://passkeys.dev/docs/advanced/related-origins/) (Chrome and Edge 128, Safari 18, Firefox 152; at most 5 registrable domains).
- A browser asks for the passkeys of one RP ID at a time. When people have passkeys for more than one of the app's hosts, `GET /api/auth/status` lists them as `passkeyDomains`, the passkey domain first, and the sign-in page adds "Use a passkey made for {host}" for each of the others. `GET /api/auth/passkey/generate-authenticate-options?rpId=<host>` asks for one of them.
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

The Default column is the policy of an app that sets none. An app sets its own in code, the policy that applies until an admin saves one, such as emailed codes and passkeys only, with the methods it changes:

```ts
createAuth({ ..., signInPolicy: { password: 'forbidden' } })
```

It is checked at startup as an admin's save is, so a default that would lock people out stops the app; without mail it applies as a saved policy does (password sign-in is then on). The page shows it, as never changed, until an admin saves a policy. Pair it with `protobase users create --no-password`, so the first admin has no password to fall back on.

The server stores the policy in the `sign_in_policy` table, one row per save (the newest applies, the others are its history, with who saved each and when; a newest row that no longer reads, with a rule the method does not take, counts as none, so the app's default applies), and applies it to Better Auth's endpoints; the pages only show what it allows.

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
- **Short and stoppable:** the session lasts 30 minutes (`sessionMinutes`, at most 240), is never extended, ends with the browser, and "Stop staff session" (`POST /api/auth/staff/stop`) ends it and signs the browser out. An API token it got before stops working on its next request, like that of any [ended session](#when-a-token-stops-working).
- **No takeover:** a staff session cannot change the person's password, email, passkeys, two-factor authentication or sessions, nor save the sign-in policy (`403`, `STAFF_CANNOT_CHANGE_SIGN_IN`).
- **The app decides:** admins turn staff sign-in off, or have the person emailed each time, with the [sign-in policy](#sign-in-policy).
- **One way in:** Better Auth's own `/admin/impersonate-user` and `/admin/stop-impersonating` are off (`404`), so app admins cannot sign in as their people.
- The start is limited to 5 per minute and client; only the browser that started a sign-in can finish it, within 10 minutes and once; and the page it comes back to must be on a trusted origin.

Admins find the log under the policy on the **Sign-in policy** page: each staff sign-in with the staff member, the person, the reason, and when it started and ended. It is the `staff_sign_in` table, and `GET /api/auth/staff/sign-ins` (admins) answers `{ signIns }`, newest first. A staff session is a session of Better Auth's admin plugin with `impersonatedBy` set to the staff member's address; `GET /api/auth/staff/session` answers `{ staff }` for it (`null` otherwise), which the banner shows.

### Operator provider

Any OpenID Connect provider works. Register the app with it as a confidential client:

- Redirect URI: `<BETTER_AUTH_URL>/api/auth/staff/callback`, and `<origin>/api/auth/staff/callback` for each of the app's [other origins](#several-origins): staff come back to the one they started on.
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

- The callback URL to register with GitHub is `<BETTER_AUTH_URL>/api/auth/callback/github`, and the same path on each of the app's [other origins](#several-origins) it should sign in on. A GitHub OAuth App takes one callback URL, so it covers one origin; a GitHub App takes several. A GitHub App needs the Email addresses (read-only) account permission, or sign-in fails with `email_not_found`.
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

## Sign-in with SAML

`sso.saml` adds the app's SAML 2.0 identity providers, such as Okta, Entra ID or Google Workspace, through Better Auth's [SSO plugin](https://www.better-auth.com/docs/plugins/sso). The sign-in page shows "Continue with {name}" for each:

```ts
import { readFileSync } from 'node:fs'

createAuth({ ..., sso: { saml: [{ id: 'okta', name: 'Okta', domains: ['example.com'], idp: { metadata: readFileSync('auth/okta-metadata.xml', 'utf8') } }] } })
```

Instead of the metadata XML, `idp` takes the provider's entity ID, sign-in URL and signing certificate: `{ entityId, ssoUrl, certificate }`, where `certificate` is a PEM, or a list of them while one rotates. The id is lowercase letters, digits or `-`, and differs from those of the other sign-in providers; `name` defaults to `SSO`.

- **What the provider's admin needs:** the entity ID and metadata URL `<BETTER_AUTH_URL>/api/auth/sso/saml2/sp/metadata?providerId=okta`, which most providers import, and the ACS URL `<origin>/api/auth/sso/saml2/sp/acs/okta` for each of the app's [origins](#several-origins). The assertion carries the address as attribute `email` (or the NameID), and the name as `givenName` and `surname` or as `displayName`; `attributes: { email, name, firstName, lastName }` names other attributes. The NameID identifies the account, so a stable one is best: persistent, or the address.
- **Who gets in:** someone at one of `domains` (subdomains count) signs in to the account with that address, linked on the first sign-in, or gets a new one with the [default role](#roles), as with GitHub; without a default role the sign-up is refused. An address outside `domains` is refused, whether or not an account has it (`EMAIL_DOMAIN_NOT_ALLOWED`, or `account_not_linked` for an existing account). With [organizations](#organizations), people still join one by invitation.
- **Sign-in links** work as for the other providers: `https://<app>/?sign-in=okta` starts it at once. A SAML provider links an account by signing in, so the Sign-in & security page does not offer to connect it.
- `GET /api/auth/status` lists the providers as `samlProviders: [{ id, name }]`. Like `socialProviders`, they have no row in the [sign-in policy](#sign-in-policy), and a required passkey or two-factor authentication still holds back the token until it is set up.
- **No migration:** the providers live in config, so the store gets no table for them.
- The plugin's defaults stay: the response must answer a request this app made, within 5 minutes of clock skew, once. Not supported yet: SCIM, single logout, sign-in started at the provider, providers kept per organization, and signed or encrypted requests.

## Platform sign-in provider

A platform that hosts the app can add a sign-in provider for the people who have an account in it: any OpenID Connect provider, passed in the environment. Protobase Cloud passes its own, so people sign in with GitHub through the Protobase GitHub App; a self-hosted app passes [Dex, Keycloak](#self-hosting-with-dex-or-keycloak) or the like.

```sh
PROTOBASE_SIGN_IN_ISSUER=https://auth.example.com     # its discovery is <issuer>/.well-known/openid-configuration
PROTOBASE_SIGN_IN_CLIENT_ID=erp-example-com
PROTOBASE_SIGN_IN_CLIENT_SECRET=...
PROTOBASE_SIGN_IN_PROVIDER=oidc                       # the default; the button, the callback and the namespace of the links
PROTOBASE_SIGN_IN_NAME="Acme SSO"                      # shown as "Continue with Acme SSO"; default GitHub for github, SSO otherwise
```

Register the app with the provider as a confidential client with the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/<provider>` (`/api/auth/callback/oidc` by default), and the same path on each of the app's [other origins](#several-origins). The app authenticates with its secret (`client_secret_basic`) and PKCE (`S256`), asks for `openid email profile`, and takes the person from the ID token only, verified against the provider's JWKS, the issuer, the client and the nonce. The provider needs no userinfo endpoint.

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

The roles are a project setting: `createAuth({ ..., roles: ['admin', 'auditor', 'sales', 'accountant'] })`. `admin` is always included and first; the default is `['admin', 'user']`. Names are lowercase letters, digits, `_` and `-`. `defaultRole` is what a new user gets when no role is given. Without it, and with more than one role besides `admin`, creating a user without a role is an error that lists the choices (the CLI then needs `--role`); with exactly one other role, that role is the default. `auth.defaultRole` is `undefined` when a role must be chosen. A user can hold several roles (`setUserRole(auth, { email, role: 'sales,accountant' })`), and acts with one of them at a time, the [active role](#active-role).

`createUser`, `setUserRole` and Better Auth's own admin endpoints refuse a role outside the list. `roleChoices(auth)` returns the list, for the CLI's `users set-role` and for UIs. Only `admin` gains Better Auth admin-plugin permissions (managing users); every other role is for your access rules, which see them as `ctx.user.roles`. Besides `admin`, the role `ai` opens the [assistant](/reference/assistant/#who-sees-it) when the project lists it.

### Active role

A session acts with one role, as it works in one [organization](#organizations): its token carries that role alone, so the API, `/meta` and with it the views, the sidebar and what the app offers follow it, as do the admin-only endpoints (the sign-in policy, the log of staff sign-ins, Better Auth's user management). A new session starts with the role the person last chose, else their first. `POST /api/auth/role/switch` with `{ role }`, one the person holds, moves the session to it; the next token carries it, without signing in again, and the user keeps it (`user.last_role`) for their next session. `GET /api/auth/role/current` answers `{ active, roles }`, the active role and the roles held, each with its label, where the session works. Someone holding one role has nothing to switch.

The app offers the roles in the profile menu, below the organizations, for someone holding more than one. The client has them as `session.roles` (`current`, `switchTo`). With organizations, the roles held are the global ones and those of the membership in the organization the session works in; a role not held there leaves the session with the person's first role there. Managing organizations (creating, entering, inviting and giving app roles) follows every role held. The session keeps its role in `session.active_role`; [`protobase auth migration`](#migrations) writes both columns.

## Organizations

Off by default: without `organizations`, an app is one organization, as above. Turned on, people work in one organization at a time, `.tenant` resources show only its rows, and the organization comes from the signed-in person instead of `tenant`:

```ts
const auth = createAuth({
  ...,
  roles: {
    admin: 'Superuser',
    manager: { label: 'Manager', grants: ['sales', 'accountant'] },
    sales: 'Sales',
    accountant: 'Accountant',
  },
  organizations: { create: 'everyone' },
})
const authenticate = betterAuthAuthenticator({ auth })
```

It is Better Auth's organization plugin, with its tables named in snake_case (`organization`, `member`, `invitation`, `session.active_organization_id`); `protobase auth migration` writes them, and `user.last_organization_id`, as the project's next migration.

**Two kinds of role.** Every membership has an organization role, Better Auth's `owner`, `admin` or `member`, which decides who manages the organization: owners and admins invite, remove and change members and edit its details; only owners hand it over, delete it or make owners. App roles, the project's `roles`, decide what the app shows and allows. A user holds them **globally** (the admin plugin's `role` column, as without organizations), which applies in every organization, or **per membership** (`member.app_roles`), which applies there only. A request's role, `ctx.user.roles`, is the session's [active role](#active-role), of either kind; access rules never see the organization role. `admin` is the superuser: global only, it holds every role. With organizations every role needs a label; `owner` and `member` cannot be app role names, and `user` stands for an account without a global role.

**Who gives which role.** Someone may give or take away a member's app role only if they hold it, in that organization or globally, or hold a role whose `grants` list it (`manager` above gives `accountant` without holding it); grants do not chain, and a superuser may give any. Only a superuser changes global roles. The creator of an organization becomes its owner with every app role (`creatorAppRoles`, default `'all'`), so they can give them on; for a role added later, list it in a role owners hold, or run `protobase organizations add-app-role <role> --to owners`.

**The organization in the token.** A new session starts in the organization the person last worked in, else their oldest membership. `/api/auth/token` adds `org` (the organization), `org_role` and `app_roles` (the membership's, narrowed to the active role), read when the token is issued; a removed member's token, or one carrying an app role taken away, [stops working](#when-a-token-stops-working) on its next request. `betterAuthAuthenticator` makes `org` the tenant and `ctx.organization.id`, and adds `app_roles` to the global roles. `POST /api/auth/organization/switch` with `{ organizationId }` moves the session; the next token names the new organization, without signing in again. Someone with a global role may switch into any organization, without being a member, and sees there what those roles allow; each such entry is an `organization.entered` [audit event](/reference/api/#audit-events). `GET /api/auth/organization/search?query=&offset=` lists every organization for them, ordered by slug, 20 at a time with the `total`, narrowed by text in the name or slug; the Organizations page shows it as All organizations. A list across organizations stays a resource without `.tenant`, readable by the global role.

**Invitations.** Better Auth's `POST /api/auth/organization/invite-member` with `{ organizationId, email, role, appRoles }`; inviting again replaces the earlier invitation, and it works for `invitationDays` (default 7). The email links to `{baseURL}/-/invitation?token=…` (`invitationUrl`), with a token signed with `secret`, since members can read invitation ids; without a mailer, the answer carries the `link` to pass on. The link page shows `GET /api/auth/invitation?token=`, accepts with `POST /api/auth/invitation/accept` for someone signed in as the invited address, and makes an account with `POST /api/auth/invitation/sign-up` (`{ token, name, password? }`) for an address without one. The link page and its sign-up serve [invitations to the app](#users-page) too. [Open sign-up](#open-sign-up) is not available with organizations: an invitation is the address someone vouched for.

**Members.** Better Auth's `list-members`, `update-member-role`, `remove-member` and `leave`; `POST /api/auth/organization/set-app-roles` (`{ memberId, appRoles }`); `POST /api/auth/organization/transfer-ownership` (`{ memberId, keepAs? }`) makes a member owner and the caller an admin in one step. `GET /api/auth/organization/current` answers the organization a session works in with the caller's roles there.

**Deleting** an organization (Better Auth's `delete`, owners only) is refused with `409 ORGANIZATION_HAS_RECORDS` while a `.tenant` resource has rows in it; `deleteRecords: 'cascade'` leaves it to the project's foreign keys. `beforeDelete` may refuse too.

**Ids.** `generateId` makes a new organization's id, by default a UUID; `.tenant` columns hold it, so `text` or `uuid`. An app whose tenant columns are integers takes the next value of its own organizations sequence instead, and adds its own row in `onCreated`, as the ERP example does (`examples/erp/auth/auth.ts`). An app that ran as one organization keeps its tenant value: `protobase organizations create "Acme" --owner you@example.com --id 1 --members all` makes that organization, with every user in it: superusers as owners, everyone else as a member, their global roles moved onto the membership.

The app's own pages are under the profile menu: the switcher, "Organizations" (theirs, a new one, and for global roles any one), "Organization" (details, leaving, handing over, deleting), and for owners and admins "Members" and "Invitations". The client has them as `session.organizations` (`list`, `current`, `switchTo`, `members`, `invite`, ...).

## Tokens and roles

Sign in at `POST /api/auth/sign-in/email` (or with a code or passkey), then `GET /api/auth/token` (with the session cookie) returns `{ token }`, an EdDSA JWT valid for 15 minutes, unless the [sign-in policy](#sign-in-policy) requires something the account has not set up; the keys are at `/api/auth/jwks`. Send it as `Authorization: Bearer <token>`. `/token` is the only way to a token in the browser: the `set-auth-jwt` header of Better Auth's JWT plugin is off.

`betterAuthAuthenticator` maps the claims to a session: `sub` is the user id, `roles` come from the `role` claim, the session's [active role](#active-role) of those in the admin plugin's `role` column on the user (a comma separated string; the first user is always `admin`). Access rules see them as `ctx.user.roles`. Without organizations, the tenant is the configured `tenant` option, never a claim; with them, it is the organization the session works in (`org`, see [organizations](#organizations)). The key set is cached in memory: read once, again every 10 minutes (so removed keys stop being accepted), and again when a token names an unknown `kid` (a rotated key), at most once per 30 seconds however many such tokens arrive (`cache: { refreshMs, minReloadMs }`). Pass `jwksUrl` and `issuer` instead of `auth` when the API runs apart from the auth server.

`jwtAuthenticator` accepts asymmetric signature algorithms only unless you pass `algorithms` explicitly (the tests do, for HS256), so a token cannot be forged with a public key used as an HMAC secret; Better Auth signs with its own key pair and publishes the public keys at `/api/auth/jwks`. An expired, tampered, wrongly signed or missing token is a `401` problem with `WWW-Authenticate: Bearer`; with an [anonymous role](/reference/access/#anonymous-access), a missing one on the resources API is served as that role instead.

### When a token stops working

With `auth`, `betterAuthAuthenticator` checks on every request that the token still stands, so these take effect on the next request every route that authenticates sees (the resources API, `/api/meta`, batches, functions, files and new `/live` streams), not when the token expires:

| Change | The token |
| --- | --- |
| A ban (`/admin/ban-user`, `protobase users disable`) | is refused until the ban runs out or is lifted; a ban ends the sessions too, so a new token takes signing in again. |
| A role taken away (`/admin/set-role`, `setUserRole`, a membership's app roles) | carrying that role is refused; the client's retry gets a token from its session with the roles left. A token carrying fewer roles than held keeps working. |
| The user deleted | is refused. |
| Signing out, a revoked session, a stopped staff session | of that session is refused; the person's other sessions keep theirs. |
| Removal from the organization | naming that organization is refused, unless a global role still enters it. |

A refused token is a `401`, as an expired one is, and the client retries the request once with a new token from `/api/auth/token`. Tokens carry their session's id in `sid`; one from [`issueToken`](#tokens-for-scripts-and-curl) names none, and is checked against the user alone.

The cost is two or three lookups by key in the auth store per request: the session by `sid`, the user by `sub`, and with organizations the membership. Nothing is cached, so every server process sees a change at once. An open `/live` stream was admitted when it connected and keeps running until it closes. With `jwksUrl` instead of `auth`, the API cannot read the auth store and a token works until it expires, as do tokens of [other apps](#users-of-another-app).

## Users of another app

An API can admit the signed-in users of another Protobase app with the tokens that app issues, so that app's admin app can draw its resources as [remote resources](/reference/remote-resources/). `betterAuthAuthenticator`'s `apps` lists each such app by its `baseURL`, the issuer of its tokens, with the roles its users' global roles become here:

```ts
betterAuthAuthenticator({ auth, apps: [{ issuer: 'https://shop.example.com', roles: { admin: 'shop' }, tenant: 1 }] })
```

Their tokens are verified against that app's keys at `<issuer>/api/auth/jwks`; a role it does not map is dropped, a role held in one of its organizations never counts, and a user left with none gets `403`; their id here is `<sub>@<that app's host>`. See [Signing in at the source](/reference/remote-resources/#signing-in-at-the-source).

## supabase-js and @supabase/ssr

An app moving from Supabase keeps its `supabase.auth` calls and its `@supabase/ssr` session checks: the app serves GoTrue's endpoints at `/auth/v1`, over the same Better Auth sign-in, so `createClient(<the app's origin>, <publishable key>)` signs in, refreshes, reads the user and signs out as on Supabase.

- `signInWithPassword`, `signInWithOtp` then `verifyOtp({ email, token, type: 'email' })`, `signInWithOAuth` with one of the app's [sign-in providers](#sign-in-with-github) (PKCE, as `@supabase/ssr` uses, or the implicit flow), `refreshSession`, `getUser`, `getClaims`, `updateUser({ password, data })` and `signOut` work. Each goes through Better Auth's own endpoint, with its rate limits and the [sign-in policy](#sign-in-policy).
  - The implicit flow is for an https `redirect_to` only. For http, including localhost, and custom schemes, use PKCE: supabase-js `flowType: 'pkce'`; `@supabase/ssr` already uses it.
  - The sign-in must start at `/auth/v1/authorize` in the same browser: `/auth/v1/callback` hands a code or a session only at the end of a provider sign-in started there.
  - The browser keeps no Protobase session afterwards: the app holds its own.
  - A wildcard pattern in `TRUSTED_ORIGINS` lets implicit-flow tokens go to any https host it matches.
- Addresses are proved with the emailed 6-digit code, never a link. `signUp({ email, password, options: { data } })` needs [open sign-up](#open-sign-up) and mails a sign-up code; `verifyOtp({ email, token, type: 'signup' })` makes the account, with `data` in the [user metadata column](#an-existing-users-table), and signs in. Until then there is no account and `signUp` answers no user. `resetPasswordForEmail` mails a sign-in code; `verifyOtp` with `type: 'recovery'` signs in, and `updateUser({ password })` sets the new password.
- The access token is ES256, valid for an hour, with Supabase's claims: `sub`, `role: authenticated`, `aud: authenticated`, `email`, `app_metadata`, `user_metadata`, `aal`, `session_id`, issued by `<baseURL>/auth/v1`. Its keys are at `/auth/v1/.well-known/jwks.json`. It is apart from the EdDSA token of [Tokens and roles](#tokens-and-roles): neither is accepted for the other.
- The refresh token is the Better Auth session's token. Each refresh gives the session a new one, so a refresh token works once, and signing out, a ban or a revoked session ends it.
- `email_confirmed_at` is the time the address was confirmed, in the user table's `email_confirmed_at` column. An account verified before that column existed has none.
- Not offered: MFA, passkeys, SSO, phone sign-in, anonymous sign-in, the admin API and changing the address.

## Tokens for scripts and curl

There is no development login. For scripts, mint a token for an existing user on the host (the CLI exposes it as `protobase token you@example.com`):

```ts
import { issueToken } from '@protobase/server'

const { token, expiresAt } = await issueToken(auth, { email: 'you@example.com', ttlSeconds: 3600 }) // default 15 minutes, at most 24 hours
```

It is signed with the same keys and carries the same claims as a token from `/api/auth/token`, with the role the user last chose, else their first, so the API treats it as any other, and a ban, a role taken away or the user deleted ends it before it expires. Banned and unknown users get an error. There is no HTTP route for this.

## Several origins

An app can be served on more than one origin, such as its platform address and the customer's own domain. `origins` lists the others; it defaults to `PROTOBASE_ORIGINS`, which a platform sets:

```ts
createAuth({ ..., baseURL: 'https://erp-x1.protobase.net', origins: ['https://admin.shop.com'], passkeyDomain: 'admin.shop.com' })
```

- A request to one of them is answered for its own host: the sign-in callbacks, the [password reset](#password-reset) link and its `redirectTo`, and a [staff sign-in](#staff-sign-in) stay there. A request to any other host is answered for `baseURL`.
- Tokens keep `baseURL` as issuer and audience, whichever origin issued them, so the API takes them on every origin. `auth.issuer` is that value and `auth.origins` every origin, `baseURL`'s first.
- Sessions are cookies of each host: a person signs in once per origin.
- `GET /.well-known/webauthn` answers `{ "origins": [...] }` with every origin of the app, on each of them, so its [passkeys](#passkeys) work on all. `protobase serve` and `protobase dev` send that path to the server, whatever the bundle's `api` says; a host in front must too.
- Each origin is a URL with the scheme of `baseURL`; one that is not stops the server at startup. The host that serves the app must pass each origin's own `Host` header on.
- The app's own origins may call each other's API from the browser ([CORS](/reference/api/#cors)).

## Public endpoints

Only the Better Auth routes under `/api/auth/*` (sign-in, password reset, [open sign-up](#open-sign-up), the start and callback of a [staff sign-in](#staff-sign-in) and the like), `GET /api/auth/status` and, with [several origins](#several-origins), `GET /.well-known/webauthn` are reachable without a token; the account, policy and staff session endpoints there need a session. The API (`/api/v1/*`) and the system endpoints (`/api/meta`, `/api/openapi.json`, `/api/docs`) all answer `401` without one, but for what an [anonymous role](/reference/access/#anonymous-access) reads in `/api/v1` and `/api/meta`, when the project defines one. [Public forms](/reference/forms/#routes) (`/api/forms/*`) need no token either.

## Roles and access in the API

Roles are bundles of capabilities (`defineRoles` in `@protobase/schema`: `orders.read.own`, `costs.read`, `*.read`, ...). Pass the result as `options.roles` to `createAdmin`, and every operation without an explicit rule needs the matching capability; a capability may be limited to [fields and rows](/reference/access/#capabilities). The token's `roles` become `ctx.user.roles` in rules; the user id (`sub`) is what `.own` compares with the resource's `.owner(...)` field, so it must be the id that field stores. How the API enforces them (hidden fields, row filters, record permissions) is in [the REST API reference](/reference/api/#access).

**User ids.** Better Auth gives a new user a random 32-character text id, so an `.owner(...)` field holds `text`: the server refuses to start (`protobase dev`, `serve`) when one holds integers or UUIDs, naming the field. An app whose owner columns are integers, such as a relation to its own users table, gives `createAuth` a `generateUserId` that takes the next value of that table's sequence, and adds the user's row there, as the ERP example does (`examples/erp/auth/auth.ts`, with the row added by `db/migrations/019_auth_users.sql` when someone joins an organization). One whose owner columns are UUIDs gives it `generateUserId: 'uuid'` (see [An existing users table](#an-existing-users-table)). A request by a user whose id the owner field cannot hold, such as one made before `generateUserId`, fails with an `owner-id-mismatch` problem that names the field.
