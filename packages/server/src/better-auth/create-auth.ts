import { passkey } from '@better-auth/passkey'
import { APIError } from 'better-auth/api'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { admin, emailOTP, jwt } from 'better-auth/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { readMailSettings } from '../mail/mail-settings'
import { smtpMailer, type Mailer } from '../mail/smtp-mailer'
import { passwordResetOptions } from './password-reset'
import { signInPolicyPlugin } from './policy-plugin'
import { emailCodeOptions, twoFactorCodeOptions, unusedEmailCodePaths } from './sign-in-mail'
import { twoFactorAfterPasswordOrCode } from './two-factor-challenge'

export type CreateAuthOptions = {
  /** A `pg` Pool, or `{ dialect, type: 'postgres', schemaName? }` for a Kysely dialect: the admin store, apart from the application's tables (its own schema or database). */
  database: BetterAuthOptions['database']
  /** Public origin of the API, for example `https://admin.example.com`. Issuer and audience of the tokens; passkeys belong to its host. */
  baseURL: string
  /** The name authenticator apps and passkey prompts show for this app. Default `Protobase`. */
  appName?: string
  /** Signs cookies and encrypts the JWT private keys. Generate with `openssl rand -base64 32`. */
  secret: string
  /** Extra origins that may call the auth endpoints. `baseURL` and `https://*.trycloudflare.com` are always trusted. */
  trustedOrigins?: string[]
  /** The roles users can have, for example `['admin', 'accountant', 'warehouse']`. `admin` is always included; default `['admin', 'user']`. */
  roles?: string[]
  /**
   * The role of a user created without one. Optional: when unset, and more than one role besides `admin` exists,
   * creating a user without a role is an error that asks for one. With exactly one other role, that role is the default.
   */
  defaultRole?: string
  /** Sign-in attempts allowed per minute and client, default 5. */
  signInPerMinute?: number
  /**
   * Sends the password-reset email and the emailed sign-in and two-factor codes; without a mailer none of them is
   * offered. Defaults to SMTP with the settings the platform passes in `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`
   * (see `readMailSettings`), when set; `false` turns mail off whatever the environment says.
   */
  mailer?: Mailer | false
  /**
   * Sign-in providers for Better Auth, for example `{ github: { clientId, clientSecret } }`; the callback is
   * `{baseURL}/api/auth/callback/<provider>`. A provider also signs up people without an account, with the default role.
   * Default none.
   */
  socialProviders?: BetterAuthOptions['socialProviders']
  /** Encrypt the OAuth access, refresh and ID tokens Better Auth stores for social sign-ins, with `secret`. Default off. */
  encryptOAuthTokens?: boolean
  /** Runs after a user is created, by any route: `createUser`, an admin, or a social sign-up. Default none. */
  onUserCreated?: UserCreatedHook
}

type UserCreateHooks = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>

/** Better Auth's `databaseHooks.user.create.after`: the created user (with its `role`) and the request context, `null` outside a request. */
export type UserCreatedHook = NonNullable<UserCreateHooks['after']>

const platformMailer = () => {
  const settings = readMailSettings(globalThis.process?.env ?? {})
  return settings && smtpMailer(settings)
}

const tokenLifetime = '15m'

export const authBasePath = '/api/auth'

/**
 * Better Auth for a single-tenant admin: sign-in with a password, an emailed code or a passkey, two-factor
 * authentication, and the sign-in policy admins set; no public sign-up (every account is created on the host with
 * `createUser`, or by an admin through the admin plugin), roles from the admin plugin's `role` column, 15 minute JWTs
 * at `/api/auth/token` with the keys at `/api/auth/jwks`.
 */
const roleName = /^[a-z][a-z0-9_-]*$/

/** The configured roles with `admin` first; `admin` is added when missing. */
export const normalizeRoles = (roles: string[] = ['admin', 'user']) => {
  const bad = roles.find((role) => !roleName.test(role))
  if (bad !== undefined) throw new Error(`Invalid role "${bad}": use lowercase letters, digits, "_" or "-"`)
  return ['admin', ...new Set(roles.filter((role) => role !== 'admin'))]
}

/** The options `createAuth` gives Better Auth, with the roles, default role and mailer already resolved. */
export const betterAuthOptions = (options: CreateAuthOptions, { roles, defaultRole, mailer }: { roles: string[]; defaultRole?: string; mailer?: Mailer }) => {
  const secure = options.baseURL.startsWith('https://')
  return {
    appName: options.appName ?? 'Protobase',
    database: options.database,
    baseURL: options.baseURL,
    basePath: authBasePath,
    secret: options.secret,
    trustedOrigins: [options.baseURL, 'https://*.trycloudflare.com', ...(options.trustedOrigins ?? [])],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, ...(mailer && passwordResetOptions(mailer)) },
    ...(options.socialProviders && { socialProviders: options.socialProviders }),
    ...(options.encryptOAuthTokens && { account: { encryptOAuthTokens: true } }),
    plugins: [
      // Without a default role the plugin's own default is a name outside the list, which the hook below refuses.
      admin({ defaultRole: defaultRole ?? 'unassigned', roles: Object.fromEntries(roles.map((role) => [role, role === 'admin' ? adminAc : userAc])) }),
      jwt({
        jwt: {
          expirationTime: tokenLifetime,
          issuer: options.baseURL,
          audience: options.baseURL,
          definePayload: ({ user }) => ({ email: user.email, role: user.role }),
        },
        // Tokens come from `/token` only, which the sign-in policy holds back until required methods are set up.
        disableSettingJwtHeader: true,
      }),
      // Without a password, as for someone who signs in with a provider only, two-factor authentication is turned on without one.
      twoFactorAfterPasswordOrCode({ allowPasswordless: true, ...(mailer && { otpOptions: twoFactorCodeOptions(mailer) }) }),
      passkey(),
      ...(mailer ? [emailOTP(emailCodeOptions(mailer))] : []),
      signInPolicyPlugin({ mail: Boolean(mailer), socialProviders: Object.keys(options.socialProviders ?? {}) }),
    ],
    disabledPaths: unusedEmailCodePaths,
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const given = String((user as { role?: unknown }).role ?? '').split(',').map((name) => name.trim()).filter(Boolean)
            const unknown = given.find((name) => !roles.includes(name))
            if (given.length === 0 || unknown !== undefined) {
              throw new APIError('BAD_REQUEST', { message: `Choose a role for the new user: ${roles.join(', ')}` })
            }
            // An admin, or the host, creates the account for an address they vouch for.
            return { data: context?.path === '/admin/create-user' ? { ...user, emailVerified: true } : user }
          },
          ...(options.onUserCreated && { after: options.onUserCreated }),
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: options.signInPerMinute ?? 5 } },
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: 'lax', secure },
      // Mail goes out after the response, so asking a reset for a known address takes as long as for an unknown one.
      // Better Auth logs a failed send.
      backgroundTasks: { handler: () => {} },
    },
  } satisfies BetterAuthOptions
}

export const createAuth = (options: CreateAuthOptions) => {
  const roles = normalizeRoles(options.roles)
  if (options.defaultRole !== undefined && !roles.includes(options.defaultRole)) {
    throw new Error(`defaultRole "${options.defaultRole}" is not one of the roles: ${roles.join(', ')}`)
  }
  const others = roles.filter((role) => role !== 'admin')
  const defaultRole = options.defaultRole ?? (others.length === 1 ? others[0] : undefined)
  const mailer = options.mailer === undefined ? platformMailer() : options.mailer || undefined
  const auth = betterAuth(betterAuthOptions(options, { roles, defaultRole, mailer }))
  const socialProviders = Object.keys(options.socialProviders ?? {})
  return Object.assign(auth, { roles, defaultRole, mail: Boolean(mailer), passwordReset: Boolean(mailer), socialProviders })
}

export type AdminAuth = ReturnType<typeof createAuth>
