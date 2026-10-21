import { APIError } from 'better-auth/api'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { admin, emailOTP, genericOAuth, jwt, type JwtOptions } from 'better-auth/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { appNameOver, defaultAppName } from '../app-name'
import { goTrueIssuer, goTrueKeyPair } from '../gotrue/keys'
import { goTrueSessionsPlugin } from '../gotrue/sessions-plugin'
import { authBasePath } from './auth-base-path'
import { platformMailer } from '../mail/platform-mailer'
import type { Mailer } from '../mail/smtp-mailer'
import { readOperatorSettings, resolveOperator, type OperatorProvider, type ResolvedOperator } from './operator-provider'
import { defaultInvitationSeconds, defaultInvitationUrl } from './invitations/invitation-link-hook'
import { lastAdminGuardPlugin } from './last-admin-guard'
import { organizationClaims, lastOrganizationField, sessionOrganizationHooks } from './organizations/session-organization'
import { organizationPlugin } from './organizations/organization-plugin'
import { protobaseOrganizationPlugin } from './organizations/protobase-plugin'
import { resolveOrganizations, type OrganizationsOptions, type ResolvedOrganizations } from './organizations/options'
import { noGlobalRole, roleDefinitions, type RoleDefinitions, type RolesInput } from './organizations/role-definitions'
import type { AuthContext } from './organizations/store'
import { appOrigins, multiHostBaseURL, readOrigins, resolveOrigins } from './origins'
import { passkeyHosts, readPasskeyDomain, resolvePasskeyDomain } from './passkey-domain'
import { passkeyPlugin } from './passkey-plugin'
import { passwordResetOptions } from './password-reset'
import { narrowClaims } from './roles/active-role'
import { rolesPlugin } from './roles/roles-plugin'
import type { RoleSession, RoleUser } from './roles/session-role'
import { platformSignInFor, platformSignInProvider, readPlatformSignIn, resolvePlatformSignIn, type PlatformSignIn, type ResolvedPlatformSignIn } from './platform-sign-in'
import { appSignInPolicy } from './app-sign-in-policy'
import { signInPolicyPlugin } from './policy-plugin'
import { defaultSignInPolicy, type SignInPolicy } from './sign-in-policy'
import { emailInDomains, resolveSamlProviders, samlDisabledPaths, samlGuardPlugin, samlPlugin, type ResolvedSamlProvider, type SsoOptions } from './saml-sign-in'
import { emailCodeOptions, twoFactorCodeOptions, unusedEmailCodePaths } from './sign-in-mail'
import { signUpPaths, signUpPlugin } from './sign-up/sign-up-plugin'
import { confirmedOnCreate, confirmedOnUpdate, emailConfirmedField } from './email-confirmed'
import { coreNames, pluginNames } from './snake-case-names'
import { rehashPasswordsPlugin, verifyAcceptedHash, type PasswordHash } from './password-hashes'
import { staffSignInPlugin } from './staff-plugin'
import { twoFactorAfterPasswordOrCode } from './two-factor-challenge'
import { metadataField, userFieldsNamed, userModel, userTable, withUserColumns, type UserTableOptions } from './user-table'
import { usersPlugin } from './users/users-plugin'

export type CreateAuthOptions = {
  /** A `pg` Pool, or `{ dialect, type: 'postgres', schemaName? }` for a Kysely dialect: the admin store, apart from the application's tables (its own schema or database). */
  database: BetterAuthOptions['database']
  /** Public origin of the API, for example `https://admin.example.com`. Issuer and audience of the tokens; new passkeys are made for its host unless `passkeyDomain` names another. */
  baseURL: string
  /**
   * The other origins the app is served on, for example `['https://admin.shop.com']`. A request to one of them is
   * answered for that host: its sign-in callbacks and the links it mails, such as a password reset, stay there, and
   * passkeys work on every origin. Tokens keep `baseURL` as issuer, whatever host issued them. Defaults to the
   * comma-separated list the platform passes in `PROTOBASE_ORIGINS`, when set; none otherwise.
   */
  origins?: string[]
  /**
   * The host new passkeys are made for (their RP ID): the host of `baseURL` or of one of `origins`. Each passkey keeps
   * the one it was made for, and works on every origin, so changing it breaks none. Defaults to the one the platform
   * passes in `PROTOBASE_PASSKEY_DOMAIN`, when set, and to the host of `baseURL` otherwise.
   */
  passkeyDomain?: string
  /**
   * The app's name: authenticator apps and passkey prompts show it, the auth emails name the app with it, and the
   * default mailer sends them from it, as the sender's display name; the tab titles, the sidebar's logo and the
   * installed app show it too. The name the platform passes in `PROTOBASE_APP_NAME`, when set, overrides it; without
   * either it is `Protobase` (without a sender's display name).
   */
  appName?: string
  /** Signs cookies and encrypts the JWT private keys. Generate with `openssl rand -base64 32`. */
  secret: string
  /** Extra origins that may call the auth endpoints, such as the exact host of a dev tunnel. `baseURL` and `origins` are always trusted. */
  trustedOrigins?: string[]
  /**
   * The roles users can have, for example `['admin', 'accountant', 'warehouse']`. `admin` is always included; default
   * `['admin', 'user']`. With `organizations`, give each a label, and optionally the other roles its holders may also
   * give members: `{ manager: { label: 'Manager', grants: ['sales'] }, sales: 'Sales' }`.
   */
  roles?: RolesInput
  /**
   * The role of a user created without one. Optional: when unset, and more than one role besides `admin` exists,
   * creating a user without a role is an error that asks for one. With exactly one other role, that role is the default.
   */
  defaultRole?: string
  /**
   * Open sign-up: anyone makes their own account from the sign-in page, with `role`, after proving their address with
   * an emailed code. Off by default, so accounts come only from the host, an admin, an invitation or a sign-in provider.
   * Needs a mailer: without one it is not offered. `role` is one of `roles` and never `admin`; give it the least
   * a stranger may hold. Not with `organizations`, whose people come from invitations.
   */
  signUp?: { role: string }
  /**
   * The sign-in policy that applies until an admin saves one on the Sign-in policy page, and when the saved one no
   * longer reads: the methods it names, for example `{ password: 'forbidden' }` for emailed codes and passkeys only,
   * with everything else allowed. Checked at startup as an admin's save is. Default everything allowed.
   */
  signInPolicy?: Partial<SignInPolicy>
  /** Sign-in attempts allowed per minute and client, default 5; also the sign-up requests allowed. */
  signInPerMinute?: number
  /**
   * Sends the auth emails: the password-reset email, the emailed sign-in and two-factor codes, and those of sign-up,
   * staff sign-in and invitations; without a mailer none of them is offered. Defaults to SMTP with the settings the
   * platform passes in `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM` (see `readMailSettings`), when set; `false`
   * turns mail off whatever the environment says.
   */
  mailer?: Mailer | false
  /**
   * Sign-in providers for Better Auth, for example `{ github: { clientId, clientSecret } }`; the callback is
   * `{baseURL}/api/auth/callback/<provider>`. A provider also signs up people without an account, with the default role.
   * One with the id of `signInProvider` takes its place. Default none.
   */
  socialProviders?: BetterAuthOptions['socialProviders']
  /** Encrypt the OAuth access, refresh and ID tokens Better Auth stores for social sign-ins, with `secret`. Default off. */
  encryptOAuthTokens?: boolean
  /** Runs after a user is created, by any route: `createUser`, an admin, or a social sign-up. Default none. */
  onUserCreated?: UserCreatedHook
  /**
   * The id of a new user, by any route. Default Better Auth's random 32-character text. `.owner()` fields hold it: a
   * `text` column for the default, an integer column when this takes the next value of the app's own users sequence,
   * or a `uuid` column with `'uuid'`, which makes a random UUID in code and makes every id column of the store a `uuid`.
   */
  generateUserId?: (() => string | Promise<string>) | 'uuid'
  /**
   * The user table, when it is one another system made, such as Supabase's `auth.users`: its name, the columns named
   * otherwise than Protobase names them, and a JSON column for each user's metadata, for example `{ table: 'users',
   * columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' }`. The other tables keep their names. Default the
   * table `protobase auth migration` makes.
   */
  users?: UserTableOptions
  /**
   * Password hashes another system wrote that sign-in accepts besides Better Auth's own, such as `['bcrypt']` for
   * Supabase Auth's. The first sign-in with one stores the password again as Better Auth hashes it. Default none.
   */
  passwordHashes?: PasswordHash[]
  /**
   * The identity provider the operator's staff sign in with to sign in as people of this app, for support. Defaults
   * to the one the platform passes in `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID` and
   * `PROTOBASE_OPERATOR_CLIENT_SECRET` (see `readOperatorSettings`), when set; `false` turns staff sign-in off
   * whatever the environment says.
   */
  operator?: OperatorProvider | false
  /**
   * A sign-in provider the platform adds for people who already have an account: an OpenID Connect provider that never
   * signs anyone up. Defaults to the one the platform passes in `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID`
   * and `PROTOBASE_SIGN_IN_CLIENT_SECRET` (see `readPlatformSignIn`), when set; `false` turns it off whatever the
   * environment says. Left out when `socialProviders` has a provider with the same id.
   */
  signInProvider?: PlatformSignIn | false
  /**
   * Single sign-on with the app's SAML 2.0 identity providers, for example `{ saml: [{ id: 'okta', name: 'Okta',
   * domains: ['example.com'], idp: { metadata } }] }` (see `SamlProvider`). Like `socialProviders`, a provider signs up
   * people without an account, with the default role, but only at its `domains`, where it also links to the account
   * with the same address. Default none.
   */
  sso?: SsoOptions
  /**
   * Turns on organizations: people work in one at a time, records of `.tenant` resources are scoped to it, and roles
   * are held globally (on the user) or per membership. Off by default: the app works as one organization.
   */
  organizations?: OrganizationsOptions
}

type UserCreateHooks = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>

/** Better Auth's `databaseHooks.user.create.after`: the created user (with its `role`) and the request context, `null` outside a request. */
export type UserCreatedHook = NonNullable<UserCreateHooks['after']>

const platformOperator = () => readOperatorSettings(globalThis.process?.env ?? {})

const platformSignInSettings = () => readPlatformSignIn(globalThis.process?.env ?? {})

const platformOrigins = () => readOrigins(globalThis.process?.env ?? {})

const platformPasskeyDomain = () => readPasskeyDomain(globalThis.process?.env ?? {})

const tokenLifetime = '15m'

export { authBasePath }

/**
 * Better Auth for a single-tenant admin: sign-in with a password, an emailed code or a passkey, two-factor
 * authentication, and the sign-in policy admins set; no public sign-up unless `signUp` turns it on (every account is
 * created on the host with `createUser`, or by an admin through the admin plugin), roles from the admin plugin's `role`
 * column, 15 minute JWTs at `/api/auth/token` with the keys at `/api/auth/jwks`.
 */
/** The configured roles with `admin` first; `admin` is added when missing. */
export const normalizeRoles = (roles?: RolesInput) => roleDefinitions(roles).names

// Admins of the app do not sign in as its people; the operator's staff do, through the staff sign-in, with its guardrails.
const adminImpersonationPaths = ['/admin/impersonate-user', '/admin/stop-impersonating']

type Resolved = {
  /** The origins besides `baseURL`, from `resolveOrigins`. */
  origins?: string[]
  /** The RP ID of new passkeys, from `resolvePasskeyDomain`; default the host of `baseURL`. */
  passkeyDomain?: string
  roles: string[]
  /** The roles with their labels, for the role switcher. */
  definitions: RoleDefinitions
  defaultRole?: string
  /** The app's name, from `PROTOBASE_APP_NAME` or `appName`; default `Protobase`. */
  appName?: string
  mailer?: Mailer
  /** The role of accounts made by open sign-up, when it is on and there is a mailer. */
  signUpRole?: string
  operator?: ResolvedOperator
  platformSignIn?: ResolvedPlatformSignIn
  /** The SAML providers, from `resolveSamlProviders`. */
  saml?: ResolvedSamlProvider[]
  organizations?: ResolvedOrganizations
  /** The auth context once the instance exists, for the organization hooks and claims. */
  context?: () => Promise<AuthContext>
  /** The policy until an admin saves one, from `appSignInPolicy`; default everything allowed. */
  signInPolicy?: SignInPolicy
}

const newUserId = (generate: NonNullable<CreateAuthOptions['generateUserId']>) => (generate === 'uuid' ? crypto.randomUUID() : generate())

const noContext = () => Promise.reject(new Error('The auth context is read only once createAuth has made the instance'))

// With organizations, the active organization starts as the last one and a member's token carries it; the
// organization plugin's own active-organization and accept endpoints are replaced by Protobase's.
const organizationPaths = ['/organization/set-active', '/organization/accept-invitation']

/**
 * The options `createAuth` gives Better Auth, with the roles, default role, mailer, operator provider and platform
 * sign-in provider already resolved.
 */
export const betterAuthOptions = (options: CreateAuthOptions, { origins = [], passkeyDomain, roles, definitions, defaultRole, appName = defaultAppName, mailer, signUpRole, operator, platformSignIn, saml = [], organizations, context = noContext, signInPolicy = defaultSignInPolicy }: Resolved) => {
  const secure = options.baseURL.startsWith('https://')
  const signIn = platformSignInFor(platformSignIn, Object.keys(options.socialProviders ?? {}))
  const hosts = passkeyHosts([options.baseURL, ...origins])
  const mail = mailer && { mailer, appName, baseURL: options.baseURL }
  const samlIds = saml.map((provider) => provider.id)
  const users = userTable(options.users)
  const passwordHashes = options.passwordHashes ?? []
  const policy = {
    mail: Boolean(mailer),
    defaultPolicy: signInPolicy,
    socialProviders: [...Object.keys(options.socialProviders ?? {}), ...samlIds],
    ...(operator && { operator: operator.name }),
    ...(signIn && { platformSignIn: { provider: signIn.provider, name: signIn.name } }),
  }
  const jwtOptions = {
    schema: pluginNames.jwt,
    // Protobase's tokens are EdDSA; the GoTrue-compatible endpoints' are ES256, with a key of their own.
    jwks: { keyPairConfigs: [goTrueKeyPair] },
    jwt: {
      expirationTime: tokenLifetime,
      issuer: options.baseURL,
      audience: options.baseURL,
      // The token carries the session's active role alone; see `narrowClaims`.
      definePayload: async ({ user, session }) => {
        const { activeRole, activeOrganizationId } = session as RoleSession
        const claims = { role: user.role, ...(organizations && (await organizationClaims((await context()).adapter, user, activeOrganizationId))) }
        return { email: user.email, ...narrowClaims(claims, [activeRole, (user as RoleUser).lastRole], Boolean(organizations)) }
      },
    },
    // Tokens come from `/token` only, which the sign-in policy holds back until required methods are set up.
    disableSettingJwtHeader: true,
  } satisfies JwtOptions
  const userFields = { ...userFieldsNamed(emailConfirmedField, users), ...(organizations && userFieldsNamed(lastOrganizationField, users)), ...metadataField(users) }
  return {
    appName,
    database: options.database,
    baseURL: multiHostBaseURL(options.baseURL, origins),
    basePath: authBasePath,
    secret: options.secret,
    trustedOrigins: [options.baseURL, ...origins, ...(options.trustedOrigins ?? [])],
    // The minimum length holds for new passwords only: one another system accepted signs in as it is.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      ...(passwordHashes.length > 0 && { password: { verify: verifyAcceptedHash(passwordHashes) } }),
      ...(mail && passwordResetOptions(mail)),
    },
    ...(options.socialProviders && { socialProviders: options.socialProviders }),
    user: Object.keys(userFields).length > 0 ? { ...userModel(users), additionalFields: userFields } : userModel(users),
    session: coreNames.session,
    verification: coreNames.verification,
    account: {
      ...coreNames.account,
      // Someone signed in links a provider account with another address on purpose, from their account page.
      accountLinking: { allowDifferentEmails: true },
      ...(options.encryptOAuthTokens && { encryptOAuthTokens: true }),
    },
    plugins: [
      // Without a default role the plugin's own default is a name outside the list, which the hook below refuses.
      admin({ schema: pluginNames.admin, defaultRole: defaultRole ?? 'unassigned', roles: Object.fromEntries(roles.map((role) => [role, role === 'admin' ? adminAc : userAc])) }),
      jwt(jwtOptions),
      // Without a password, as for someone who signs in with a provider only, two-factor authentication is turned on without one.
      twoFactorAfterPasswordOrCode({ schema: pluginNames.twoFactor, allowPasswordless: true, ...(mail && { otpOptions: twoFactorCodeOptions(mail) }) }),
      passkeyPlugin({ domain: passkeyDomain ?? hosts[0]!, hosts, formerDomain: hosts[0]!, origins: appOrigins(options.baseURL, origins) }),
      ...(mail ? [emailOTP(emailCodeOptions(mail))] : []),
      ...(mail && signUpRole ? [signUpPlugin({ role: signUpRole, mail, defaultPolicy: signInPolicy })] : []),
      ...(signIn ? [genericOAuth({ config: [platformSignInProvider(signIn)] })] : []),
      ...(saml.length > 0 ? [samlPlugin(saml, options.baseURL), samlGuardPlugin(samlIds)] : []),
      signInPolicyPlugin(policy),
      goTrueSessionsPlugin({ issuer: goTrueIssuer(options.baseURL), jwt: jwtOptions, policy }),
      staffSignInPlugin({ ...(operator && { operator }), ...(mail && { mail }), defaultPolicy: signInPolicy }),
      rolesPlugin({ definitions }),
      lastAdminGuardPlugin(),
      ...(organizations
        ? [organizationPlugin({ resolved: organizations, secret: options.secret, ...(mail && { mail }), context }), protobaseOrganizationPlugin({ resolved: organizations, mail: Boolean(mailer) })]
        : []),
      // After the organization plugin, whose endpoints of the same names (`getInvitation`) the invitation links' replace.
      usersPlugin({
        definitions,
        defaultPolicy: signInPolicy,
        ...(mail && { mail }),
        invitationUrl: organizations?.invitationUrl ?? defaultInvitationUrl(options.baseURL),
        invitationSeconds: organizations?.invitationExpiresIn ?? defaultInvitationSeconds,
        ...(organizations && { organizations }),
      }),
      ...(passwordHashes.length > 0 ? [rehashPasswordsPlugin(passwordHashes)] : []),
    ].map((plugin) => withUserColumns(plugin, users)),
    disabledPaths: [...unusedEmailCodePaths, ...adminImpersonationPaths, ...(organizations ? organizationPaths : []), ...(saml.length > 0 ? samlDisabledPaths : [])],
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const given = String((user as { role?: unknown }).role ?? '').split(',').map((name) => name.trim()).filter(Boolean)
            const unknown = given.find((name) => !roles.includes(name))
            if (given.length === 0 || unknown !== undefined) {
              throw new APIError('BAD_REQUEST', { message: `Choose a role for the new user: ${roles.join(', ')}` })
            }
            // A SAML provider vouches for the addresses at its own domains only.
            const samlProvider = context?.path === '/sso/saml2/sp/acs/:providerId' ? saml.find((provider) => provider.id === context.params?.providerId) : undefined
            if (samlProvider && !emailInDomains(user.email, samlProvider.domains)) {
              throw new APIError('FORBIDDEN', { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'This address is not one the identity provider may sign up.' })
            }
            const withId = options.generateUserId ? { ...user, id: await newUserId(options.generateUserId) } : user
            // An admin, or the host, creates the account for an address they vouch for; so does a SAML provider, at its domains.
            return { data: confirmedOnCreate(context?.path === '/admin/create-user' || samlProvider ? { ...withId, emailVerified: true } : withId, new Date()) }
          },
          ...(options.onUserCreated && { after: options.onUserCreated }),
        },
        update: { before: async (user) => ({ data: confirmedOnUpdate(user, new Date()) }) },
      },
      ...(organizations && { session: sessionOrganizationHooks(context) }),
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: options.signInPerMinute ?? 5 },
        '/staff/sign-in': { window: 60, max: 5 },
        '/invitation/sign-up': { window: 60, max: options.signInPerMinute ?? 5 },
        [signUpPaths.sendCode]: { window: 60, max: options.signInPerMinute ?? 5 },
        [signUpPaths.verifyCode]: { window: 60, max: options.signInPerMinute ?? 5 },
        [signUpPaths.create]: { window: 60, max: options.signInPerMinute ?? 5 },
      },
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: 'lax', secure },
      // Mail goes out after the response, so asking a reset for a known address takes as long as for an unknown one.
      // Better Auth logs a failed send.
      backgroundTasks: { handler: () => {} },
      // Every id column is a uuid then, also each that points at a user; the other tables' ids come from their default,
      // a user's from `newUserId`, as a table another system made may have no default.
      ...(options.generateUserId === 'uuid' && { database: { generateId: 'uuid' as const } }),
    },
  } satisfies BetterAuthOptions
}

// The role open sign-up gives: one of the roles, and never admin, whatever the app asks.
const checkSignUpRole = (role: string, roles: string[]) => {
  if (role === 'admin') throw new Error('signUp.role cannot be admin: give the least a stranger may hold')
  if (!roles.includes(role)) throw new Error(`signUp.role "${role}" is not one of the roles: ${roles.join(', ')}`)
  return role
}

export const createAuth = (options: CreateAuthOptions) => {
  // People of organizations come from invitations.
  if (options.signUp && options.organizations) throw new Error('signUp is not available with organizations: their people join by invitation')
  const definitions = roleDefinitions(options.roles, { organizations: options.organizations !== undefined })
  const roles = definitions.names
  if (options.defaultRole !== undefined && !roles.includes(options.defaultRole)) {
    throw new Error(`defaultRole "${options.defaultRole}" is not one of the roles: ${roles.join(', ')}`)
  }
  const signUpRole = options.signUp && checkSignUpRole(options.signUp.role, roles)
  const signInPolicy = appSignInPolicy(options.signInPolicy)
  const others = roles.filter((role) => role !== 'admin')
  // With organizations, roles mostly come with memberships: a new account holds no global role unless given one.
  const defaultRole = options.defaultRole ?? (options.organizations ? noGlobalRole : others.length === 1 ? others[0] : undefined)
  const appName = appNameOver(globalThis.process?.env ?? {}, options.appName)
  // The platform's mailer sends as the app's own name, when the app or the platform names it.
  const mailer = options.mailer === undefined ? platformMailer(undefined, appName) : options.mailer || undefined
  const provider = options.operator === undefined ? platformOperator() : options.operator || undefined
  const operator = provider && resolveOperator(provider)
  const signInSettings = options.signInProvider === undefined ? platformSignInSettings() : options.signInProvider || undefined
  const socialProviders = Object.keys(options.socialProviders ?? {})
  const platformSignIn = platformSignInFor(signInSettings && resolvePlatformSignIn(signInSettings), socialProviders)
  const saml = resolveSamlProviders(options.sso?.saml ?? [], [...socialProviders, ...(platformSignIn ? [platformSignIn.provider] : [])])
  const origins = resolveOrigins(options.baseURL, options.origins ?? platformOrigins())
  const passkeyDomain = resolvePasskeyDomain(options.passkeyDomain ?? platformPasskeyDomain(), [options.baseURL, ...origins])
  const organizations = options.organizations && resolveOrganizations(options.organizations, definitions, options.baseURL)
  // The organization hooks read the store through the instance made below; they run only once it exists.
  let instance: { $context: Promise<AuthContext> } | undefined
  const context = () => instance?.$context ?? Promise.reject(new Error('The auth instance is not made yet'))
  const auth = betterAuth(betterAuthOptions(options, { origins, passkeyDomain, roles, definitions, defaultRole, ...(appName && { appName }), mailer, signUpRole, operator, platformSignIn, saml, signInPolicy, ...(organizations && { organizations, context }) }))
  instance = auth as unknown as { $context: Promise<AuthContext> }
  return Object.assign(auth, {
    /** Issuer and audience of the tokens: `baseURL`, on every origin. */
    issuer: options.baseURL,
    /** Every origin the app is served on, `baseURL`'s first. */
    origins: appOrigins(options.baseURL, origins),
    /** The RP ID of new passkeys. */
    passkeyDomain,
    roles,
    roleDefinitions: definitions,
    organizations,
    defaultRole,
    /** New users get their ids from `generateUserId` instead of Better Auth's random text. */
    generatesUserIds: Boolean(options.generateUserId),
    mail: Boolean(mailer),
    /** The policy until an admin saves one. */
    signInPolicy,
    passwordReset: Boolean(mailer),
    /** Open sign-up is on and offered: the app asks for it, and can mail the codes. */
    signUp: Boolean(signUpRole && mailer),
    /** The role of accounts made by open sign-up, while it is offered. */
    signUpRole: mailer ? signUpRole : undefined,
    /** The app keeps each user's metadata, in the column `users.metadata` names. */
    userMetadata: Boolean(options.users?.metadata),
    socialProviders,
    /** The app's name it signs in and mails as: `PROTOBASE_APP_NAME`, else `appName`, else `Protobase`. */
    appName: appName ?? defaultAppName,
    operator: operator?.name,
    platformSignIn: platformSignIn && { provider: platformSignIn.provider, name: platformSignIn.name },
    /** The id and name of each SAML provider, for the sign-in page. */
    samlProviders: saml.map(({ id, name }) => ({ id, name })),
  })
}

export type AdminAuth = ReturnType<typeof createAuth>
