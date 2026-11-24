import { APIError } from 'better-auth/api'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { admin, emailOTP, genericOAuth, jwt, type JwtOptions } from 'better-auth/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { appNameOver, defaultAppName } from '../app-name'
import { goTrueIssuer, goTrueKeyPair } from '../gotrue/keys'
import { goTrueSessionsPlugin } from '../gotrue/sessions-plugin'
import { betterAuthLinkedAccounts, type TokenAuth } from '../personal-mail/linked-accounts'
import { resolvePersonalMail, type PersonalMailEntry } from '../personal-mail/personal-mail-providers'
import { personalMailer, type PersonalMail } from '../personal-mail/personal-mailer'
import { mailLinkHooks } from '../personal-mail/mail-link-hooks'
import { mailSendersPlugin } from '../personal-mail/mail-senders-plugin'
import type { SenderAddressVerifier } from '../personal-mail/verifiers/sender-address-verifier'
import { senderVerifications, type SenderVerifications } from '../personal-mail/verifiers/sender-verifications'
import { verificationStore } from '../personal-mail/verifiers/verification-store'
import { mailSenderUseCheck, type MailSenderUseCheck } from '../personal-mail/mail-sender-use-check'
import { sqlSenderStore, type MailSenderStore } from '../personal-mail/sender-store'
import { sharedSenderReader, type SharedSenderReader } from '../personal-mail/shared-sender-store'
import { storeSqlOf } from './store/store-sql'
import { bothAccountHooks, connectionAccountHooks } from './connections/connection-account-hooks'
import { connectionEvents, type ConnectionEvents } from './connections/connection-events'
import { listConnections } from './connections/list-connections'
import { connectionProvidersPlugin } from './connections/connection-oauth-provider'
import { refreshRefusalsPlugin } from './refresh-refusals'
import { connectionsPlugin } from './connections/connections-plugin'
import { releaseUserConnections } from './connections/release-user-connections'
import { sealedRevoker } from './connections/sealed-revocation'
import { resolveConnections, type ConnectionClient, type DeclaredConnection, type ResolvedConnection } from './connections/declared-connections'
import { endReplacedSession } from './end-replaced-session'
import { authBasePath } from './auth-base-path'
import { authLogger } from './auth-logger'
import { cookiePrefixOf } from './cookie-prefix'
import { jsonOnlyOnMobile, mobileRequests, type MobileRequests } from './mobile-requests'
import { passwordLength } from './new-account-password'
import { platformMailer } from '../mail/platform-mailer'
import type { Mailer } from '../mail/smtp-mailer'
import { readOperatorSettings, resolveOperator, type OperatorProvider, type ResolvedOperator } from './operator-provider'
import { defaultInvitationSeconds } from './invitations/invitation-link-hook'
import { lastAdminGuardPlugin } from './last-admin-guard'
import { leakedPasswordsPlugin } from './leaked-passwords'
import { lockedAccountsPlugin, readLockedAccounts } from './locked-accounts'
import { selfDeletionCallbackPath, selfDeletionOptions, selfDeletionPath } from './self-deletion'
import { userDeletion, type UserDeletion } from './user-deletion'
import { revokeMcpGrants } from './mcp/revoke-grants'
import type { mcpAuthPlugins } from './mcp/mcp-auth-plugins'
import { openIdUnusedPaths, resolveOpenIdProvider, type OpenIdProviderOptions, type ResolvedOpenIdProvider } from './openid-provider/openid-provider-options'
import type { openIdProviderPlugins } from './openid-provider/openid-provider-plugins'
import { resolveOAuthApi, type OAuthApiOptions, type OAuthApiResource } from './oauth-api'
import { mcpScope, mcpUnusedPaths, resolveMcp, type McpAuthOptions, type ResolvedMcp } from './mcp/mcp-plugins'
import { lastOrganizationField, sessionOrganizationHooks } from './organizations/session-organization'
import { resolvePersonalAccessTokens, type PersonalAccessTokensOptions } from './personal-access-tokens/options'
import { personalAccessTokenPaths, personalAccessTokensPlugin } from './personal-access-tokens/token-plugin'
import { keptNames, pinOnce, type OrganizationsOff, type PinRead } from './organizations/kept-organizations'
import { pinnedMembershipPlugin } from './organizations/pinned-membership'
import { pinnedSessionHooks } from './organizations/pinned-sessions'
import { storeDb } from './store/store-db'
import { organizationPlugin } from './organizations/organization-plugin'
import { derivedSlugPlugin } from './organizations/derived-slug'
import { protobaseOrganizationPlugin } from './organizations/protobase-plugin'
import { resolveOrganizations, type OrganizationsOptions, type ResolvedOrganizations } from './organizations/options'
import { noGlobalRole, roleDefinitions, type RoleDefinitions, type RolesInput } from './organizations/role-definitions'
import type { AuthContext } from './organizations/store'
import { appOrigins, multiHostBaseURL, readOrigins, resolveOrigins } from './origins'
import { passkeyHosts, readPasskeyDomain, resolvePasskeyDomain } from './passkey-domain'
import { passkeyPlugin } from './passkey-plugin'
import { passwordResetOptions } from './password-reset'
import { mailPasswordChanged, passwordChangePlugin } from './password-change'
import { passwordChecksPlugin } from './password-checks'
import { setPasswordPath, setPasswordPlugin } from './set-password'
import { rolesPlugin } from './roles/roles-plugin'
import { versionedSecrets } from './secret-versions'
import { signingKeyRotation, signingKeys } from './signing-keys'
import type { RoleSession, RoleUser } from './roles/session-role'
import type { Session } from '../types'
import { platformSignInFor, platformSignInProvider, providerPagesOffPlugin, resolvePlatformSignIns, type PlatformSignIn, type ResolvedPlatformSignIn } from './platform-sign-in'
import { readPlatformSignIns } from './platform-sign-in-env'
import { hiddenAccountsPlugin, oneAccountPerProvider, singleSubjectField } from './platform-accounts'
import { fixedAuthorizationParamsPlugin } from './platform-authorization-params'
import { deviceLinksPlugin } from './platform-devices'
import { appSignInPolicy } from './app-sign-in-policy'
import { signInPolicyPlugin } from './policy-plugin'
import { defaultSignInPolicy, type SignInPolicy } from './sign-in-policy'
import { assertNoEndpointKeyClashes } from './endpoint-key-clashes'
import { idTokenSignInPlugin } from './id-token-sign-in'
import type { samlPlugin } from './saml-plugin'
import { emailInDomains, resolveSamlProviders, samlDisabledPaths, samlGuardPlugin, type ResolvedSamlProvider, type SsoOptions } from './saml-sign-in'
import { noAccountMailPlugin } from './no-account-mail'
import { emailCodeOptions, twoFactorCodeOptions, unusedEmailCodePaths } from './sign-in-mail'
import { resolveSignUpDomains, signUpTakes } from './sign-up/sign-up-domains'
import { signUpPaths, signUpPlugin } from './sign-up/sign-up-plugin'
import { codeSignsUp, codeSignUpPlugin } from './sign-up/code-sign-up-plugin'
import { resolveSignUpFields, type SignUpField } from './sign-up/sign-up-fields'
import { confirmedOnCreate, confirmedOnUpdate, emailConfirmedField } from './email-confirmed'
import { rehashPasswordsPlugin, verifyAcceptedHash, type PasswordHash } from './password-hashes'
import { staffSignInPlugin } from './staff-plugin'
import { strongSignInsPlugin } from './strong-sign-ins'
import { recentConfirmationPlugin } from './recent-confirmation'
import { confirmationCodePaths, confirmationCodePlugin } from './confirmation-code-plugin'
import { passwordConfirmationPath, passwordConfirmationPlugin } from './password-confirmation'
import { tokenClaims } from './token-claims'
import { twoFactorAfterFirstFactor } from './two-factor-challenge'
import { metadataField, userTable, type UserTableOptions } from './user-table'
import { betterAuthNames } from './names/better-auth-names'
import { storeNamesPlugin } from './names/names-plugin'
import { modulesOf } from './names/modules-on'
import { resolveNames, type ResolvedNames, type TableNames } from './names/resolve-names'
import { storeSchema } from './store/store-names'
import { usersPlugin } from './users/users-plugin'

export type CreateAuthOptions = {
  /**
   * The admin store, apart from the application's tables (its own schema or database): the app's own Kysely as
   * `{ db, type: 'postgres', schemaName? }`, whose plugins every sign-in query passes through; a `pg` Pool; or
   * `{ dialect, type: 'postgres', schemaName? }` for a Kysely dialect.
   */
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
  /**
   * The secrets the app had before `secret`, newest first, such as `PROTOBASE_PREVIOUS_SECRETS`: what they encrypted
   * still decrypts, so the signing keys keep signing after the secret changes. Default none.
   */
  previousSecrets?: string[]
  /** Days a token signing key signs before a new one takes over; default 30. */
  signingKeyDays?: number
  /** Days a replaced signing key still verifies the tokens it signed; default 7, at least 1. */
  signingKeyGraceDays?: number
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
   * a stranger may hold. Not with `organizations`, whose people come from invitations. `domains`, for example
   * `['example.com']`, limits it to addresses there (subdomains count); `PROTOBASE_SIGN_UP_DOMAINS`, when set, replaces
   * it. An empty list leaves open sign-up off. `fields` is what it asks for: `['email', 'name']` by default, or
   * `['email']`, when the emailed sign-in code makes the account of an address without one on the spot.
   */
  signUp?: { role: string; domains?: string[]; fields?: SignUpField[] }
  /**
   * The sign-in policy that applies until an admin saves one on the Sign-in policy page, and when the saved one no
   * longer reads: the methods it names, for example `{ password: 'forbidden' }` for emailed codes and passkeys only,
   * with everything else allowed. Checked at startup as an admin's save is. Default everything allowed.
   */
  signInPolicy?: Partial<SignInPolicy>
  /**
   * What the sign-in page leads with: `password`, the email address and a password, with emailing a code below it; or
   * `emailCode`, the address and "Email me a sign-in code", with the password behind "Use a password", for apps whose
   * people mostly never set one. Only while the policy leaves both on; default `password`.
   */
  signInFirst?: 'password' | 'emailCode'
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
   * One with the id of a provider of `signInProviders` takes its place. Default none.
   */
  socialProviders?: BetterAuthOptions['socialProviders']
  /**
   * The mail providers people may link their own mailbox with, from the account page, for the app's functions to send
   * mail from it (`context.personalMail`), such as `['gmail']`. Each links through its sign-in provider, which
   * `socialProviders` must have: Gmail through `google`. An entry may add optional scopes the provider offers for more
   * abilities, such as `{ provider: 'gmail', scopes: [gmailSettingsScope] }`, with which the link reads the mailbox's
   * send-as addresses and whether Gmail sends as each. Needs `encryptOAuthTokens`. Default none.
   */
  personalMail?: PersonalMailEntry[]
  /** Encrypt the OAuth access and refresh tokens Better Auth stores for social sign-ins, with `secret`; `personalMail` and workflow connections need it. Default off. */
  encryptOAuthTokens?: boolean
  /**
   * The OAuth client of each workflow plugin's connection that signs in through a provider of its own, by
   * `<plugin>:<connection>`, such as `{ 'acme:account': { clientId, clientSecret } }`; its redirect URI is
   * `{baseURL}/api/auth/callback/workflow-<plugin>-<connection>`. A connection through one of `socialProviders` needs none.
   */
  connections?: Record<string, ConnectionClient>
  /**
   * The connections the app's workflow plugins declare, which people connect accounts through (`createAdmin` passes
   * them from `workflows.plugins`), and whether their providers may be at private addresses, for development and tests.
   */
  workflowConnections?: { declared: DeclaredConnection[]; allowPrivateAddresses?: boolean }
  /** Runs after a user is created, by any route: `createUser`, an admin, or a social sign-up. Default none. */
  onUserCreated?: UserCreatedHook
  /**
   * The id of a new user, by any route. Default Better Auth's random 32-character text. `.owner()` fields hold it: a
   * `text` column for the default, an integer column when this takes the next value of the app's own users sequence,
   * or a `uuid` column with `'uuid'`, which makes a random UUID in code and makes every id column of the store a `uuid`.
   */
  generateUserId?: (() => string | Promise<string>) | 'uuid'
  /**
   * The names of the store's tables and columns where the app wants others than the built-in ones (see `TableNames`),
   * such as `{ user: { name: 'users', columns: { role: 'app_role' } } }` for Supabase's `auth.users`. Default the
   * built-in names.
   */
  tables?: TableNames
  /**
   * The user table, when it is one another system made, such as Supabase's `auth.users`: a JSON column for each user's
   * metadata, the table under a view over it, and the schemas the other system keeps its sign-in data in, for example
   * `{ metadata: 'raw_user_meta_data' }`. `tables.user` names the table and its columns.
   */
  users?: UserTableOptions
  /**
   * Password hashes another system wrote that sign-in accepts besides Better Auth's own, such as `['bcrypt']` for
   * Supabase Auth's. The first sign-in with one stores the password again as Better Auth hashes it. Default none.
   */
  passwordHashes?: PasswordHash[]
  /**
   * Refuses a new password that appears in a known data breach, by Have I Been Pwned's password list: at sign-up, from
   * an invitation, and when a password is set, changed, reset or given by an admin. Only the first five characters of
   * the password's SHA-1 hash leave the server. While the list cannot be reached, setting a password fails. Default off.
   */
  leakedPasswords?: boolean
  /**
   * Lets the signed-in person delete their own account from the account page, with their password or from a session
   * that signed in within the last day; `false` turns it off, for apps whose accounts are managed by an organization's
   * admins. Default on, as app stores require an app that makes accounts to delete them too.
   */
  accountDeletion?: boolean
  /**
   * The identity provider the operator's staff sign in with to sign in as people of this app, for support. Defaults
   * to the one the platform passes in `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID` and
   * `PROTOBASE_OPERATOR_CLIENT_SECRET` (see `readOperatorSettings`), when set; `false` turns staff sign-in off
   * whatever the environment says.
   */
  operator?: OperatorProvider | false
  /**
   * The sign-in providers the platform adds for people who already have an account: OpenID Connect providers that never
   * sign anyone up, each with its own id. Defaults to those the platform passes in `PROTOBASE_SIGN_IN_ISSUER`,
   * `PROTOBASE_SIGN_IN_CLIENT_ID` and `PROTOBASE_SIGN_IN_CLIENT_SECRET`, and the sets named by a provider's id such as
   * `PROTOBASE_SIGN_IN_PHONE_ISSUER` (see `readPlatformSignIns`); `[]` turns them off whatever the environment says. One
   * is left out when `socialProviders` has a provider with its id. Without `clientSecret`, one signs in by token sign-in
   * alone, with tokens for the origin of `baseURL` unless `clientId` names another.
   */
  signInProviders?: readonly PlatformSignIn[]
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
  /**
   * What the config says of organizations while they are off: their default organization and `authenticate.tenant`.
   * The instance reads once whether the store still holds organizations, so they were on (`pinnedOrganization`), and
   * then pins the default organization, refusing a tenant other than its id: only its members sign in and use their
   * tokens, people who join become its members, and personal access tokens are made in it.
   */
  organizationsOff?: OrganizationsOff
  /**
   * Turns on an OAuth provider for MCP clients: a client such as an AI assistant or code editor that speaks MCP registers
   * itself, the person signs in on the app's own pages and allows it on the connect page, and the client gets tokens
   * for the MCP endpoint only, with the role and organization the person worked in when they allowed it. `true` for the
   * defaults, or the endpoint's `path` (default `/api/mcp`) and the `connectPage` (default `/-/connect`). Needs an
   * https `baseURL`, or localhost, and the OAuth tables from `protobase auth migration`. Off by default.
   */
  mcp?: true | McpAuthOptions
  /** What the OAuth provider of `mcp` serves besides MCP: `api` lets clients get tokens for the app's API (see `OAuthApiOptions`). Needs `mcp`. */
  oauth?: OAuthApiOptions
  /**
   * Turns the app into an OpenID provider for the clients its admins register (`/api/auth/openid-provider/clients`),
   * such as other apps that let people sign in with it: a person signs in on the app's own pages and the client gets
   * an ID token with their `sub`, `email` and `email_verified`, without being asked to allow it. Nothing registers
   * itself, and any other client or redirect URI is refused. A client allowed to exchange gets ID tokens for the other
   * clients from its own access token (RFC 8693), without a browser. `true` for the defaults, or the `connectPage`
   * (default `/-/connect`). Not with `mcp`. Off by default.
   */
  openIdProvider?: true | OpenIdProviderOptions
  /**
   * Turns on personal access tokens: a signed-in person makes long-lived tokens on their account page, for a script to
   * call the app's API as them with `Authorization: Bearer <token>`. `prefix` starts every token, lowercase letters,
   * digits and underscores ending in `_`, such as `invoices_`; it has no default. Off by default.
   */
  personalAccessTokens?: PersonalAccessTokensOptions
  /**
   * The ways the app proves that mail from a From address goes out from it, which its trusted code adds with
   * `add_verifier` (`auth/hooks.ts` `senderVerifiers`), or a host's runtime passes; needs `personalMail`. Default none.
   */
  senderVerifiers?: readonly SenderAddressVerifier[]
}

// The session hooks, with a new session ending the one the browser's cookie held (see `endReplacedSession`).
const withEndedReplaced = <H extends { create?: object }>(hooks: H) => ({ ...hooks, create: { ...hooks.create, after: endReplacedSession } })

type SessionHooks = NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['session']>
type SessionCreateBefore = NonNullable<NonNullable<SessionHooks['create']>['before']>

// A session `refuse` refuses, such as one a connection's own provider would start, is refused before the other hooks.
const refusingConnectionSessions = (hooks: SessionHooks, refuse: SessionCreateBefore | undefined): SessionHooks => {
  if (!refuse) return hooks
  const before = hooks.create?.before
  return {
    ...hooks,
    create: {
      ...hooks.create,
      before: async (session, context) => {
        await refuse(session, context)
        return before?.(session, context)
      },
    },
  }
}

type UserCreateHooks = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>

/** Better Auth's `databaseHooks.user.create.after`: the created user (with its `role`) and the request context, `null` outside a request. */
export type UserCreatedHook = NonNullable<UserCreateHooks['after']>

const platformOperator = () => readOperatorSettings(globalThis.process?.env ?? {})

const platformSignInSettings = () => readPlatformSignIns(globalThis.process?.env ?? {})

const platformOrigins = () => readOrigins(globalThis.process?.env ?? {})

const platformPasskeyDomain = () => readPasskeyDomain(globalThis.process?.env ?? {})

const platformLockedAccounts = () => readLockedAccounts(globalThis.process?.env ?? {})

const tokenLifetime = '15m'

// The store's names the options give.
const optionsNames = (options: CreateAuthOptions) => resolveNames({ schema: storeSchema({ options }), tables: options.tables, modules: modulesOf(options) })

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

// They answer the signed-in person with the access and refresh tokens a sign-in provider gave, such as a linked
// Gmail's, which send mail as them: the tokens stay on the server, which reads them through `auth.api`.
export const providerTokenPaths = ['/get-access-token', '/refresh-token']

type Resolved = {
  /** The store's names, from `resolveNames`; default those of `tables`. */
  names?: ResolvedNames
  /** The organization pinned while organizations are off after being on, when the options say what of them (`pinOnce`). */
  pin?: PinRead
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
  /** The email domains open sign-up takes, from `resolveSignUpDomains`; every address without them. */
  signUpDomains?: string[]
  /** What open sign-up asks for, from `resolveSignUpFields`. */
  signUpFields?: SignUpField[]
  operator?: ResolvedOperator
  platformSignIn?: ResolvedPlatformSignIn[]
  /** The SAML providers, from `resolveSamlProviders`. */
  saml?: ResolvedSamlProvider[]
  organizations?: ResolvedOrganizations
  /** The MCP provider's options, resolved (`resolveMcp`), when it is on. */
  mcp?: ResolvedMcp
  /** The app's API as an OAuth resource of the MCP provider, resolved (`resolveOAuthApi`), when `oauth.api` is on. */
  api?: OAuthApiResource
  /** The OpenID provider's options, resolved (`resolveOpenIdProvider`), when it is on. */
  openId?: ResolvedOpenIdProvider
  /** The personal access tokens' options, checked (`resolvePersonalAccessTokens`), when they are on. */
  personalAccessTokens?: PersonalAccessTokensOptions
  /** The auth context once the instance exists, for the organization hooks and claims and the MCP provider. */
  context?: () => Promise<AuthContext>
  /** The policy until an admin saves one, from `appSignInPolicy`; default everything allowed. */
  signInPolicy?: SignInPolicy
  /** The requests from the app's iOS or Android build, whose Capacitor origin is trusted too (see `handleMobile`). */
  mobile?: MobileRequests
  /** What runs when a user is deleted (see `userDeletion`). */
  deletion?: UserDeletion
  /** Whether records of the app hold a From address, asked before one goes (see `mailSenderUseCheck`). */
  mailSenderUse?: MailSenderUseCheck
  /** The app's verifiers of From addresses at work, when it has any (see `senderVerifications`). */
  senderVerifications?: SenderVerifications
  /** Mail from a person's own mailbox, which the account page's refresh of their send-as addresses goes through (see `personalMailer`). */
  personalMailer?: (userId: string) => PersonalMail
  /** The From addresses others shared with a person, which the account page lists (see `sharedSenderReader`). */
  sharedSenders?: SharedSenderReader
  /** The addresses of the accounts no one changes or deletes, from `PROTOBASE_LOCKED_ACCOUNTS` (see `lockAccounts`). */
  lockedAccounts?: string[]
  /** The workflow connections, from `resolveConnections`, and the listener of their links and disconnects. */
  connections?: { resolved: ResolvedConnection[]; events: ConnectionEvents; allowPrivateAddresses: boolean }
} & AuthPlugins

/**
 * The plugins only some apps use, which `loadAuthPlugins` imports when the options turn them on: the SSO plugin of
 * `sso.saml`, the OAuth provider of `mcp` and the OpenID provider of `openIdProvider`.
 */
export type AuthPlugins = { samlPlugin?: typeof samlPlugin; mcpAuthPlugins?: typeof mcpAuthPlugins; openIdProviderPlugins?: typeof openIdProviderPlugins }

/** The optional plugins `options` turns on, imported: an app without SAML, MCP or the OpenID provider loads none of them. */
export const loadAuthPlugins = async (options: Pick<CreateAuthOptions, 'sso' | 'mcp' | 'openIdProvider'>): Promise<AuthPlugins> => ({
  ...((options.sso?.saml.length ?? 0) > 0 && { samlPlugin: (await import('./saml-plugin')).samlPlugin }),
  ...(options.mcp && { mcpAuthPlugins: (await import('./mcp/mcp-auth-plugins')).mcpAuthPlugins }),
  ...(options.openIdProvider && { openIdProviderPlugins: (await import('./openid-provider/openid-provider-plugins')).openIdProviderPlugins }),
})

const loaded = <T>(plugin: T | undefined, option: string): T => {
  if (!plugin) throw new Error(`${option} needs its plugin loaded: build auth with buildAuth, which loads it`)
  return plugin
}

const newUserId = (generate: NonNullable<CreateAuthOptions['generateUserId']>) => (generate === 'uuid' ? crypto.randomUUID() : generate())

const noContext = () => Promise.reject(new Error('The auth context is read only once createAuth has made the instance'))
// Only createAuth wires a person's mailbox to the account page's refresh: options made alone, as in a test, have none.
const mailboxOff = () => Promise.reject(new Error('Not implemented: refreshing send-as addresses needs the mailer createAuth wires'))
const noMailer = (): PersonalMail => ({ send: mailboxOff, sender: mailboxOff, senders: mailboxOff, refresh: mailboxOff })

// With organizations, the active organization starts as the last one and a member's token carries it; the
// organization plugin's own active-organization and accept endpoints are replaced by Protobase's.
const organizationPaths = ['/organization/set-active', '/organization/accept-invitation']

/** The reads every page load makes, which the rate limit leaves out: they check a session, never a credential. */
const pageLoadReads = ['/get-session', '/role/current', '/token']

/**
 * The options `createAuth` gives Better Auth, with the roles, default role, mailer, operator provider and platform
 * sign-in provider already resolved.
 */
export const betterAuthOptions = (options: CreateAuthOptions, { origins = [], passkeyDomain, roles, definitions, defaultRole, appName = defaultAppName, mailer, signUpRole, signUpDomains, signUpFields = resolveSignUpFields(undefined), operator, platformSignIn = [], saml = [], organizations, mcp, api, openId, personalAccessTokens, context = noContext, signInPolicy = defaultSignInPolicy, mobile, deletion, mailSenderUse, senderVerifications: verifications, personalMailer: mailOf = noMailer, sharedSenders, lockedAccounts = [], connections, names = optionsNames(options), pin, ...plugins }: Resolved) => {
  const named = betterAuthNames(names)
  // Organizations off, maybe after being on: the tables they keep, under their kept names, read while the pin holds.
  const kept = pin && keptNames(names)
  const pinned = pin && pinnedSessionHooks(pin, context)
  const mailProviders = resolvePersonalMail(options.personalMail ?? [], Object.keys(options.socialProviders ?? {}), options.encryptOAuthTokens === true)
  const connectionHooks = connections && connections.resolved.length > 0 ? connectionAccountHooks(connections.resolved, connections.events) : undefined
  const ownProviders = (connections?.resolved ?? []).filter(({ declaration }) => 'oauth' in declaration).map(({ providerId }) => providerId)
  const secure = options.baseURL.startsWith('https://')
  const signIns = platformSignInFor(platformSignIn, Object.keys(options.socialProviders ?? {}))
  const platformIds = signIns.map(({ provider }) => provider)
  const devices = signIns.filter(({ devices }) => devices)
  // A device provider's accounts are on the account page's devices, not its connected accounts.
  const offAccountPage = signIns.filter(({ hidden, devices }) => hidden || devices).map(({ provider }) => provider)
  const singleSubject = signIns.filter(({ devices }) => !devices).map(({ provider }) => provider)
  const hosts = passkeyHosts([options.baseURL, ...origins])
  const mail = mailer && { mailer, appName, baseURL: options.baseURL }
  // The role of accounts the emailed sign-in code makes on the spot, when open sign-up asks for the address only.
  const codeSignUp = signUpFields.includes('name') ? undefined : signUpRole
  const samlIds = saml.map((provider) => provider.id)
  const users = userTable(options.users)
  const passwordHashes = options.passwordHashes ?? []
  const policy = {
    mail: Boolean(mailer),
    defaultPolicy: signInPolicy,
    socialProviders: [...Object.keys(options.socialProviders ?? {}), ...samlIds],
    ...(operator && { operator: operator.name }),
    platformSignIn: signIns.map(({ provider, name }) => ({ provider, name })),
    names: named,
  }
  const jwtOptions = {
    schema: named.schema('jwks'),
    // Protobase's tokens are EdDSA; the GoTrue-compatible endpoints' are ES256, with a key of their own. Both rotate.
    jwks: { keyPairConfigs: [goTrueKeyPair], ...signingKeyRotation(options) },
    jwt: {
      expirationTime: tokenLifetime,
      issuer: options.baseURL,
      audience: options.baseURL,
      // The token carries the session's active role alone; see `narrowClaims`. `sid` names the session, so the
      // authenticator refuses the token once it is signed out (`checkTokenStanding`).
      definePayload: async ({ user, session }) => {
        const { activeRole, activeOrganizationId } = session as RoleSession
        const wanted = [activeRole, (user as RoleUser).lastRole]
        const claims = await tokenClaims(user, { wanted, organizationId: activeOrganizationId, ...(organizations && { organizations: (await context()).adapter }) })
        return { ...claims, sid: session.id }
      },
    },
    // Tokens come from `/token` only, which the sign-in policy holds back until required methods are set up.
    disableSettingJwtHeader: true,
  } satisfies JwtOptions
  const keys = signingKeys(jwtOptions)
  const { secrets, legacySecret } = versionedSecrets(options.secret, options.previousSecrets)
  const trusted = [options.baseURL, ...origins, ...(options.trustedOrigins ?? [])]
  const userFields = { ...named.fields('user', [emailConfirmedField]), ...(organizations && named.fields('user', [lastOrganizationField])), ...metadataField(users) }
  const accountDeletion = options.accountDeletion !== false
  const deleteUser = accountDeletion ? { deleteUser: selfDeletionOptions({ lockedAccounts, mcp: Boolean(mcp), context, ...(deletion && { deletion }) }) } : {}
  return {
    appName,
    database: options.database,
    logger: authLogger,
    baseURL: multiHostBaseURL(options.baseURL, origins),
    basePath: authBasePath,
    // Better Auth encrypts with the first of `secrets`; `secret` decrypts what was encrypted before they had versions.
    secret: legacySecret,
    secrets,
    trustedOrigins: mobile ? (request?: Request) => [...trusted, ...mobile.trusted(request)] : trusted,
    // The minimum length holds for new passwords only: one another system accepted signs in as it is.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: passwordLength.min,
      maxPasswordLength: passwordLength.max,
      ...(passwordHashes.length > 0 && { password: { verify: verifyAcceptedHash(passwordHashes) } }),
      ...(mail &&
        passwordResetOptions(mail, {
          onPasswordReset: async ({ user }, request) => {
            const auth = await context()
            if (mcp) await revokeMcpGrants(auth.adapter, user.id)
            await mailPasswordChanged({ context: auth, headers: request?.headers }, mail, user.email)
          },
        })),
    },
    ...(options.socialProviders && { socialProviders: options.socialProviders }),
    user: { ...named.user, ...(Object.keys(userFields).length > 0 && { additionalFields: userFields }), ...deleteUser },
    // Better Auth's fresh-session check could only be met by signing in again; `recentConfirmationPlugin` replaces it.
    session: { ...named.session, freshAge: 0 },
    verification: named.verification,
    account: {
      ...named.account,
      ...(singleSubject.length > 0 && { additionalFields: named.fields('account', [singleSubjectField]) }),
      // Someone signed in links a provider account with another address on purpose, from their account page.
      // A connection's own provider links only, from someone signed in, as sign-in through it is refused, so its
      // account's address need not be one it vouches for. A first sign-in links by the address only when the provider
      // says it verified it and the account's own address is verified too.
      accountLinking: { allowDifferentEmails: true, requireLocalEmailVerified: true, ...(ownProviders.length > 0 && { trustedProviders: ownProviders }) },
      ...(options.encryptOAuthTokens && { encryptOAuthTokens: true }),
    },
    plugins: [
      // First, so every other plugin writes through the adapter it guards.
      ...(lockedAccounts.length > 0 ? [lockedAccountsPlugin(lockedAccounts)] : []),
      // Without a default role the plugin's own default is a name outside the list, which the hook below refuses.
      admin({ schema: named.schema('user', 'session'), defaultRole: defaultRole ?? 'unassigned', roles: Object.fromEntries(roles.map((role) => [role, role === 'admin' ? adminAc : userAc])) }),
      jwt(jwtOptions),
      keys.plugin,
      // Without a password, as for someone who signs in with a provider only, two-factor authentication is turned on without one.
      twoFactorAfterFirstFactor({ schema: named.schema('user', 'twoFactor'), allowPasswordless: true, ...(mail && { otpOptions: twoFactorCodeOptions(mail) }) }),
      passkeyPlugin({ domain: passkeyDomain ?? hosts[0]!, hosts, formerDomain: hosts[0]!, origins: appOrigins(options.baseURL, origins), names: named }),
      strongSignInsPlugin(),
      recentConfirmationPlugin(),
      passwordConfirmationPlugin(),
      ...(mail ? [emailOTP(emailCodeOptions(mail)), noAccountMailPlugin(mail, codeSignUp ? (context, email) => codeSignsUp(context, email, signUpDomains) : undefined), confirmationCodePlugin(mail)] : []),
      ...(mail && signUpRole ? [signUpPlugin({ role: signUpRole, ...(signUpDomains && { domains: signUpDomains }), fields: signUpFields, mail, defaultPolicy: signInPolicy })] : []),
      ...(signIns.length > 0 ? [genericOAuth({ config: signIns.map(platformSignInProvider) })] : []),
      ...(signIns.some(({ pages }) => !pages) ? [providerPagesOffPlugin(signIns.filter(({ pages }) => !pages).map(({ provider }) => provider))] : []),
      ...(signIns.length > 0 ? [fixedAuthorizationParamsPlugin(platformIds)] : []),
      ...(offAccountPage.length > 0 ? [hiddenAccountsPlugin(offAccountPage)] : []),
      ...(devices.length > 0 ? [deviceLinksPlugin(devices.map(({ provider, name }) => ({ provider, name })), named)] : []),
      ...(connections && connections.resolved.length > 0
        ? [connectionProvidersPlugin(connections.resolved, { allowPrivateAddresses: connections.allowPrivateAddresses }), connectionsPlugin({ connections: connections.resolved, events: connections.events, allowPrivateAddresses: connections.allowPrivateAddresses })]
        : []),
      // After the plugins that add providers, so it marks the refusals of every provider's refresh.
      refreshRefusalsPlugin(),
      ...(saml.length > 0 ? [loaded(plugins.samlPlugin, 'sso.saml')(saml, options.baseURL), samlGuardPlugin(samlIds)] : []),
      signInPolicyPlugin(policy),
      // After the policy's plugin, so an emailed code it refuses makes no account.
      ...(mail && codeSignUp ? [codeSignUpPlugin({ role: codeSignUp, ...(signUpDomains && { domains: signUpDomains }), mail })] : []),
      idTokenSignInPlugin({ tokenSignIn: signIns.filter(({ tokenSignIn }) => tokenSignIn).map(({ provider, clientId, devices }) => ({ provider, clientId, devices })) }),
      passwordChecksPlugin(),
      setPasswordPlugin(),
      passwordChangePlugin(mail),
      ...(options.leakedPasswords ? [leakedPasswordsPlugin()] : []),
      goTrueSessionsPlugin({ issuer: goTrueIssuer(options.baseURL), jwt: jwtOptions, signingKey: keys.ensure, policy }),
      staffSignInPlugin({ ...(operator && { operator }), ...(mail && { mail }), defaultPolicy: signInPolicy, names: named }),
      rolesPlugin({ definitions, names: named }),
      lastAdminGuardPlugin(),
      // After the last-admin guard, so a refused removal deletes nothing of the user.
      ...(deletion ? [deletion.plugin] : []),
      ...(organizations
        ? [organizationPlugin({ resolved: organizations, secret: options.secret, ...(mail && { mail }), context, names: named }), protobaseOrganizationPlugin({ resolved: organizations, mail: Boolean(mailer) }), derivedSlugPlugin()]
        : []),
      usersPlugin({
        definitions,
        defaultPolicy: signInPolicy,
        ...(mail && { mail }),
        ...(organizations?.invitationUrl !== undefined && { invitationUrl: organizations.invitationUrl }),
        invitationSeconds: organizations?.invitationExpiresIn ?? defaultInvitationSeconds,
        ...(organizations && { organizations }),
      }),
      ...(passwordHashes.length > 0 ? [rehashPasswordsPlugin(passwordHashes)] : []),
      ...(kept ? [pinnedMembershipPlugin(kept, pin, ['/token', personalAccessTokenPaths.create])] : []),
      ...(personalAccessTokens ? [personalAccessTokensPlugin({ options: personalAccessTokens, definitions, names: named, organizations: Boolean(organizations), ...(kept && { pinned: { pin, kept } }) })] : []),
      ...(mailProviders.length > 0 ? [mailSendersPlugin(mailProviders, named, mailOf, mailSenderUse, verifications, sharedSenders)] : []),
      // Last, so the staff plugin refuses staff sessions on the provider's paths before its own hooks run.
      ...(mcp ? loaded(plugins.mcpAuthPlugins, 'mcp')({ mcp, ...(api && { api }), organizations: Boolean(organizations), mail: Boolean(mailer), defaultPolicy: signInPolicy, definitions, context, names: named }) : []),
      ...(openId ? loaded(plugins.openIdProviderPlugins, 'openIdProvider')({ openId, mail: Boolean(mailer), defaultPolicy: signInPolicy, names: named }) : []),
      // The store's names, on the context, where the store's own SQL reads them.
      storeNamesPlugin(names),
    ].map((plugin) => named.plugin(plugin)),
    disabledPaths: [selfDeletionCallbackPath, ...(accountDeletion ? [] : [selfDeletionPath]), ...unusedEmailCodePaths, ...adminImpersonationPaths, ...providerTokenPaths, ...(organizations ? organizationPaths : []), ...(saml.length > 0 ? samlDisabledPaths : []), ...(mcp ? mcpUnusedPaths : []), ...(openId ? openIdUnusedPaths : [])],
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            await pinned?.user.before(user, context)
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
          ...(pinned
            ? {
                after: async (user, context) => {
                  await pinned.user.after(user)
                  await options.onUserCreated?.(user, context)
                },
              }
            : options.onUserCreated && { after: options.onUserCreated }),
        },
        update: { before: async (user) => ({ data: confirmedOnUpdate(user, new Date()) }) },
      },
      session: refusingConnectionSessions(refusingConnectionSessions(withEndedReplaced(organizations ? sessionOrganizationHooks(context) : {}) as SessionHooks, connectionHooks?.session.create?.before), pinned?.session),
      // Linking a mailbox makes that account the one mail goes through; linking a connection's account resumes its
      // triggers; a person holds one account of each platform provider, but for one of devices.
      account: ((mail) => (connectionHooks ? bothAccountHooks(mail, connectionHooks.account) : mail))(bothAccountHooks(oneAccountPerProvider(singleSubject), mailLinkHooks(mailProviders))),
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        // Every page load reads the session, the role it acts with and its token: limiting them would refuse browsing.
        ...Object.fromEntries(pageLoadReads.map((path) => [path, false as const])),
        '/sign-in/email': { window: 60, max: options.signInPerMinute ?? 5 },
        // Starting a provider's sign-in, and signing in with a token the platform's provider issued.
        '/sign-in/social': { window: 60, max: options.signInPerMinute ?? 5 },
        '/staff/sign-in': { window: 60, max: 5 },
        [setPasswordPath]: { window: 60, max: 5 },
        '/invitation/sign-up': { window: 60, max: options.signInPerMinute ?? 5 },
        [signUpPaths.sendCode]: { window: 60, max: options.signInPerMinute ?? 5 },
        [signUpPaths.verifyCode]: { window: 60, max: options.signInPerMinute ?? 5 },
        [signUpPaths.create]: { window: 60, max: options.signInPerMinute ?? 5 },
        [confirmationCodePaths.send]: { window: 60, max: 5 },
        [confirmationCodePaths.verify]: { window: 60, max: 5 },
        [passwordConfirmationPath]: { window: 60, max: 5 },
      },
    },
    advanced: {
      // The prefix brings `__Host-` on https (`cookiePrefixOf`), which takes the place of Better Auth's `__Secure-`.
      useSecureCookies: false,
      cookiePrefix: cookiePrefixOf(options.baseURL),
      defaultCookieAttributes: { sameSite: 'lax', secure, path: '/' },
      // Mail goes out after the response, so asking a reset for a known address takes as long as for an unknown one.
      // Better Auth logs a failed send.
      backgroundTasks: { handler: () => {} },
      database: {
        // Better Auth would compare the store's tables with its own at every start; the database's record of migrations
        // says where it is instead (`checkMigrationRecord`), and `protobase dev` compares them on the developer's machine.
        validateSchema: false,
        // Every id column is a uuid then, also each that points at a user; the other tables' ids come from their default,
        // a user's from `newUserId`, as a table another system made may have no default.
        ...(options.generateUserId === 'uuid' && { generateId: 'uuid' as const }),
      },
    },
  } satisfies BetterAuthOptions
}

// The role open sign-up gives: one of the roles, and never admin, whatever the app asks.
const checkSignUpRole = (role: string, roles: string[]) => {
  if (role === 'admin') throw new Error('signUp.role cannot be admin: give the least a stranger may hold')
  if (!roles.includes(role)) throw new Error(`signUp.role "${role}" is not one of the roles: ${roles.join(', ')}`)
  return role
}

export const createAuth = (options: CreateAuthOptions, plugins: AuthPlugins = {}) => {
  // People of organizations come from invitations.
  if (options.signUp && options.organizations) throw new Error('signUp is not available with organizations: their people join by invitation')
  const definitions = roleDefinitions(options.roles, { organizations: options.organizations !== undefined })
  const roles = definitions.names
  if (options.defaultRole !== undefined && !roles.includes(options.defaultRole)) {
    throw new Error(`defaultRole "${options.defaultRole}" is not one of the roles: ${roles.join(', ')}`)
  }
  const signUpDomains = options.signUp && resolveSignUpDomains(options.signUp.domains, globalThis.process?.env ?? {})
  // An empty list of domains takes nobody: open sign-up is off, as without `signUp`.
  const checkedSignUpRole = options.signUp && checkSignUpRole(options.signUp.role, roles)
  const signUpRole = signUpDomains?.length === 0 ? undefined : checkedSignUpRole
  const signUpFields = resolveSignUpFields(options.signUp?.fields)
  const signInPolicy = appSignInPolicy(options.signInPolicy)
  const others = roles.filter((role) => role !== 'admin')
  // With organizations, roles mostly come with memberships: a new account holds no global role unless given one.
  const defaultRole = options.defaultRole ?? (options.organizations ? noGlobalRole : others.length === 1 ? others[0] : undefined)
  const appName = appNameOver(globalThis.process?.env ?? {}, options.appName)
  // The platform's mailer sends as the app's own name, when the app or the platform names it.
  const mailer = options.mailer === undefined ? platformMailer(undefined, appName) : options.mailer || undefined
  const provider = options.operator === undefined ? platformOperator() : options.operator || undefined
  const operator = provider && resolveOperator(provider)
  const signInSettings = options.signInProviders ?? platformSignInSettings()
  const socialProviders = Object.keys(options.socialProviders ?? {})
  const platformSignIn = platformSignInFor(resolvePlatformSignIns(signInSettings, options.baseURL), socialProviders)
  const saml = resolveSamlProviders(options.sso?.saml ?? [], [...socialProviders, ...platformSignIn.map(({ provider }) => provider)])
  const personalMail = resolvePersonalMail(options.personalMail ?? [], socialProviders, options.encryptOAuthTokens === true)
  if (Object.keys(options.connections ?? {}).length > 0 && options.encryptOAuthTokens !== true) throw new Error("auth.connections: the connected accounts' tokens would be stored in plain text; turn on auth.encryptOAuthTokens")
  const allowPrivateAddresses = options.workflowConnections?.allowPrivateAddresses === true
  const resolvedConnections = resolveConnections(options.workflowConnections?.declared ?? [], options.connections ?? {}, (options.socialProviders ?? {}) as Record<string, { clientId?: unknown; clientSecret?: unknown }>, allowPrivateAddresses)
  const clash = resolvedConnections.find(({ declaration, providerId }) => 'oauth' in declaration && socialProviders.includes(providerId))
  if (clash) throw new Error(`Workflow plugin "${clash.plugin}": its connection "${clash.name}" signs in as "${clash.providerId}", which is a sign-in provider's id too`)
  const connectionClients = resolvedConnections.filter(({ declaration, client }) => 'oauth' in declaration && client).map(({ key }) => key)
  const events = connectionEvents()
  const origins = resolveOrigins(options.baseURL, options.origins ?? platformOrigins())
  const passkeyDomain = resolvePasskeyDomain(options.passkeyDomain ?? platformPasskeyDomain(), [options.baseURL, ...origins])
  const organizations = options.organizations && resolveOrganizations(options.organizations, definitions)
  const mcp = options.mcp && resolveMcp(options.baseURL, options.mcp)
  const api = resolveOAuthApi(options.baseURL, options.oauth, mcp || undefined)
  const openId = options.openIdProvider && resolveOpenIdProvider(options.openIdProvider, mcp || undefined)
  const personalAccessTokens = options.personalAccessTokens === undefined ? undefined : resolvePersonalAccessTokens(options.personalAccessTokens)
  // The organization hooks and the MCP provider read the store through the instance made below; they run only once it exists.
  let instance: { $context: Promise<AuthContext> } | undefined
  const context = () => instance?.$context ?? Promise.reject(new Error('The auth instance is not made yet'))
  const mobile = mobileRequests()
  const deletion = userDeletion()
  const senderUse = mailSenderUseCheck()
  // Read once a request needs them: the instance and the sender store are made below.
  const mailboxOf = (userId: string) => personalMailer(betterAuthLinkedAccounts(auth as unknown as TokenAuth), personalMail, senderStore, userId)
  const verifiers = options.senderVerifiers ?? []
  if (verifiers.length > 0 && personalMail.length === 0) throw new Error('auth.senderVerifiers: verifiers prove From addresses of linked mailboxes; turn on auth.personalMail')
  const verifications = verifiers.length > 0 ? senderVerifications(verifiers, verificationStore(async () => storeSqlOf(await context())), mailboxOf) : undefined
  const sharedSenders = sharedSenderReader(async () => storeSqlOf(await context()), { organizations: Boolean(organizations), verifiers: verifications?.ids ?? [] })
  // Deleting a user revokes their connected accounts and parks the triggers on them, as disconnecting each would.
  if (resolvedConnections.length > 0) deletion.set('connections', releaseUserConnections({ connections: resolvedConnections, events, allowPrivateAddresses, context }))
  const lockedAccounts = platformLockedAccounts()
  const names = optionsNames(options)
  const pin = options.organizationsOff && !options.organizations ? pinOnce(storeDb({ options }), names, options.organizationsOff) : undefined
  const authOptions = betterAuthOptions(options, { ...plugins, names, ...(pin && { pin }), mobile, deletion, mailSenderUse: senderUse, ...(verifications && { senderVerifications: verifications }), personalMailer: mailboxOf, sharedSenders, lockedAccounts, origins, passkeyDomain, roles, definitions, defaultRole, ...(appName && { appName }), mailer, signUpRole, ...(signUpDomains && { signUpDomains }), signUpFields, operator, platformSignIn, saml, signInPolicy, ...(organizations && { organizations }), ...(mcp && { mcp }), ...(api && { api }), ...(openId && { openId }), ...(personalAccessTokens && { personalAccessTokens }), context, connections: { resolved: resolvedConnections, events, allowPrivateAddresses } })
  // Better Auth merges the plugins' endpoints by key, so a clash would hide one of them without a word.
  assertNoEndpointKeyClashes(authOptions.plugins)
  const auth = betterAuth(authOptions)
  instance = auth as unknown as { $context: Promise<AuthContext> }
  const senderStore: MailSenderStore = { ...sqlSenderStore(async () => storeSqlOf(await context())), ...(verifications && { proofsOf: verifications.proofsOf }), sharedWith: sharedSenders }
  return Object.assign(auth, {
    /**
     * Answers a request from the app's iOS or Android build: Better Auth also trusts the Capacitor origin the request
     * names. Only `createAdmin` with a `mobile` section uses it; `handler` and `api` never trust a Capacitor origin. A
     * Capacitor origin's POST without a JSON body is refused before it is granted, as only a page sends one.
     */
    handleMobile: async (request: Request) => jsonOnlyOnMobile(request) ?? auth.handler(mobile.grant(request)),
    /**
     * What runs when a user is deleted: `set` a named listener that removes what the app keeps of the user elsewhere,
     * such as their devices; `run` is for a deletion outside Better Auth's endpoints (`deleteUser`).
     */
    userDeletion: { set: deletion.set, run: deletion.run },
    /**
     * Where records hold a From address, which the app `set`s once built: removing an address, or disconnecting the
     * mailbox whose own address it is, is refused while records hold it.
     */
    mailSenderUse: { set: senderUse.set },
    /** Issuer and audience of the tokens: `baseURL`, on every origin. */
    issuer: options.baseURL,
    /** Every origin the app is served on, `baseURL`'s first. */
    origins: appOrigins(options.baseURL, origins),
    /** The RP ID of new passkeys. */
    passkeyDomain,
    roles,
    roleDefinitions: definitions,
    organizations,
    /**
     * The organization everyone works in while organizations are off after being on, `undefined` while they are on or
     * were never on; read from the store once (`pinOnce`), and refused with a tenant other than its id, which the
     * server's startup checks ask first.
     */
    pinnedOrganization: pin ?? (async () => undefined),
    /** The tables of organizations that sign-in reads while they are off, when the store holds them only after they were on. */
    keptTables: pin ? [keptNames(names).table('member').name] : [],
    defaultRole,
    /** New users get their ids from `generateUserId` instead of Better Auth's random text. */
    generatesUserIds: Boolean(options.generateUserId),
    mail: Boolean(mailer),
    /** The policy until an admin saves one. */
    signInPolicy,
    /** What the sign-in page leads with (`signInFirst`). */
    signInFirst: options.signInFirst ?? 'password',
    passwordReset: Boolean(mailer),
    /** New passwords are checked against Have I Been Pwned's list of leaked ones (`leakedPasswords`). */
    leakedPasswords: Boolean(options.leakedPasswords),
    /** The signed-in person can delete their own account (`accountDeletion`). */
    accountDeletion: options.accountDeletion !== false,
    /** Open sign-up is on and offered: the app asks for it, and can mail the codes. */
    signUp: Boolean(signUpRole && mailer),
    /** The role of accounts made by open sign-up, while it is offered. */
    signUpRole: mailer ? signUpRole : undefined,
    /** The email domains open sign-up takes (`signUp.domains` or `PROTOBASE_SIGN_UP_DOMAINS`); every address without them. */
    signUpDomains,
    /** What open sign-up asks for (`signUp.fields`): without `name`, the emailed sign-in code makes the account. */
    signUpFields,
    /** Whether open sign-up is offered and takes the address. */
    signUpTakes: (email: string) => Boolean(signUpRole && mailer) && signUpTakes(email, signUpDomains),
    /** The app keeps each user's metadata, in the column `users.metadata` names. */
    userMetadata: Boolean(options.users?.metadata),
    /** The store's tables and columns, as `tables` names them. */
    names,
    /** What the store knows of the user table besides its names (`users`). */
    users: userTable(options.users),
    socialProviders,
    /** The app's name it signs in and mails as: `PROTOBASE_APP_NAME`, else `appName`, else `Protobase`. */
    appName: appName ?? defaultAppName,
    operator: operator?.name,
    /** The platform's sign-in providers: each one's id, name, whether people sign in through its pages, whether it takes token sign-in, whether it is off the account page, whether the sign-in page shows its button, and whether its accounts are devices. */
    platformSignIn: platformSignIn.map(({ provider, name, pages, tokenSignIn, hidden, button, devices }) => ({ provider, name, pages, tokens: tokenSignIn === true, hidden, button, devices })),
    /** The id and name of each SAML provider, for the sign-in page. */
    samlProviders: saml.map(({ id, name }) => ({ id, name })),
    /** The mail providers people link their own mailbox with (`personalMail`). */
    personalMail,
    /** Mail from `userId`'s own mailbox, through the mail provider they linked, from the addresses they may use (see `personalMailer`). */
    personalMailer: mailboxOf,
    /** What workflow connections can sign in with: whether tokens are stored encrypted, the sign-in providers, the connections with a client. */
    connectionSupport: { encrypted: options.encryptOAuthTokens === true, signInProviders: socialProviders, clients: connectionClients },
    /**
     * The workflow connections people connect accounts through, the listener (`set`) the workflows give for their links
     * and disconnects, `list`, on the server only, of the session's own person's accounts, as `GET /connections` lists them,
     * and how a revocation the provider did not take is tried again (`revokeSealed`).
     */
    connections: {
      declared: resolvedConnections,
      events: { set: events.set },
      list: async (session: Session) => listConnections({ findAccounts: async (userId) => (await auth.$context).internalAdapter.findAccounts(userId), connections: resolvedConnections, events }, session.user.id),
      revokeSealed: sealedRevoker(resolvedConnections, async () => (await context()).secretConfig, allowPrivateAddresses),
    },
    /** The app's secret, with the ones it rotated through, as `sealToken` seals with it and Better Auth reads it back. */
    secretKey: async () => (await context()).secretConfig,
    /** The OAuth provider for MCP clients, when on: the endpoint's resource (its URL) and path, and the scope its tokens carry. */
    mcp: mcp && { resource: mcp.resource, path: mcp.path, scope: mcpScope },
    /** The OAuth resource of the app's API, when clients may get tokens for it (`oauth.api`): the audience the API takes them with. */
    oauthApi: api,
    /** The app is an OpenID provider for the clients its admins register (`openIdProvider`). */
    openIdProvider: Boolean(openId),
    /** Personal access tokens, when on: the prefix every token starts with. */
    personalAccessTokens,
    /** The jobs of the app's verifiers of From addresses: the sweep that checks and expires their verifications. */
    senderVerificationJobs: verifications ? verifications.jobs : [],
  })
}

export type AdminAuth = ReturnType<typeof createAuth>

/** `createAuth` with the optional plugins its options turn on loaded first (see `loadAuthPlugins`). */
export const buildAuth = async (options: CreateAuthOptions): Promise<AdminAuth> => createAuth(options, await loadAuthPlugins(options))
