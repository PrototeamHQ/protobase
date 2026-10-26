import { PostgresDialect, type PostgresPool } from 'kysely'
import type { OrganizationOptions } from 'better-auth/plugins/organization'
import type { Db } from '@protobase/query'
import type { Mailer } from '../mail/smtp-mailer'
import { buildAuth, type CreateAuthOptions, type UserCreatedHook } from './create-auth'
import type { McpAuthOptions } from './mcp/mcp-plugins'
import type { OrganizationsOptions } from './organizations/options'
import type { StoredMember, StoredOrganization } from './organizations/store'

/** What every hook of the project's own gets as its last argument: the app's database, the one jobs get. */
export type HookContext = { db: Db }

type OrganizationHooks = NonNullable<OrganizationOptions['organizationHooks']>

/**
 * What the project's auth/hooks.ts exports: the auth hooks that run the project's own code, each called with the
 * hook's own input and the app's `HookContext` last.
 */
export type AuthHooks = {
  /** The id of a new user, by any route, such as the next value of the app's own users sequence. */
  generateUserId?: (app: HookContext) => string | Promise<string>
  /** Runs after a user is created, by any route: `protobase users create`, an admin, or a social sign-up. */
  onUserCreated?: (user: Parameters<UserCreatedHook>[0], context: Parameters<UserCreatedHook>[1], app: HookContext) => Promise<void>
  /** The id of a new organization; default a random UUID. */
  generateOrganizationId?: (app: HookContext) => string | Promise<string>
  /** Runs after an organization is created, with its owner's membership, for example to add the app's own row for it. */
  onOrganizationCreated?: (input: { organization: StoredOrganization; member: StoredMember }, app: HookContext) => Promise<void>
  /** Runs before an organization is deleted; throwing refuses the deletion. */
  beforeOrganizationDeleted?: (organization: StoredOrganization, app: HookContext) => Promise<void>
  /** Better Auth's organization hooks, run after Protobase's own. */
  organizationHooks?: { [K in keyof OrganizationHooks]?: (input: Parameters<NonNullable<OrganizationHooks[K]>>[0], app: HookContext) => ReturnType<NonNullable<OrganizationHooks[K]>> }
}

/**
 * `auth` in `protobase.config.ts`: the sign-in settings as data. The store is the app's own database, in `schema`;
 * the hooks and a mailer of the project's own are found in auth/hooks.ts and auth/mailer.ts.
 */
export type AuthSettings = Omit<CreateAuthOptions, 'database' | 'secret' | 'generateUserId' | 'onUserCreated' | 'mailer' | 'organizations' | 'mcp'> & {
  /** Signs cookies and encrypts the JWT private keys, such as `PROTOBASE_SECRET`. Generate with `openssl rand -base64 32`. */
  secret?: string
  /** The schema of the auth store in the app's database; default `auth`. */
  schema?: string
  /** `'uuid'` gives new users a random UUID, and makes every id column of the store a `uuid`; `generateUserId` in the hooks takes the ids from the app instead. */
  generateUserId?: 'uuid'
  /** `false` turns mail off whatever the environment says; default SMTP from `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`. */
  mailer?: false
  /** Turns on organizations (see `OrganizationsOptions`); their hooks are in the hooks module. */
  organizations?: true | Omit<OrganizationsOptions, 'generateId' | 'onCreated' | 'beforeDelete' | 'hooks'>
  /** Turns on the OAuth provider for MCP clients: `true`, or the endpoint's `path` and the `connectPage`. */
  mcp?: true | Omit<McpAuthOptions, 'fetchClientMetadata'>
}

export type AppAuthInput = {
  /** The app's pool, which the store shares (`appPool`). */
  pool: PostgresPool
  /** The app's database, which the hooks get. */
  db: Db
  hooks?: AuthHooks
  /** A mailer of the project's own, in place of the default. */
  mailer?: Mailer
}

const organizationOptions = (organizations: AuthSettings['organizations'], hooks: AuthHooks, app: HookContext): OrganizationsOptions | undefined => {
  if (!organizations) return undefined
  const own = hooks.organizationHooks ?? {}
  const betterAuthHooks = Object.fromEntries(Object.entries(own).map(([name, hook]) => [name, (input: unknown) => (hook as (input: unknown, app: HookContext) => unknown)(input, app)]))
  return {
    ...(organizations === true ? {} : organizations),
    ...(hooks.generateOrganizationId && { generateId: () => hooks.generateOrganizationId!(app) }),
    ...(hooks.onOrganizationCreated && { onCreated: (input) => hooks.onOrganizationCreated!(input, app) }),
    ...(hooks.beforeOrganizationDeleted && { beforeDelete: (organization) => hooks.beforeOrganizationDeleted!(organization, app) }),
    ...(Object.keys(betterAuthHooks).length > 0 && { hooks: betterAuthHooks as OrganizationHooks }),
  }
}

/** createAuth's options for the `auth` settings, the store in the app's own database. */
export const appAuthOptions = (settings: AuthSettings, { pool, db, hooks = {}, mailer }: AppAuthInput): CreateAuthOptions => {
  const { schema = 'auth', secret, generateUserId, mailer: mail, organizations, mcp, ...rest } = settings
  if (!secret) throw new Error("the auth secret is not set: give it the app's secret, PROTOBASE_SECRET, made with `openssl rand -base64 32`")
  const app = { db }
  const organizationsOptions = organizationOptions(organizations, hooks, app)
  const userId = hooks.generateUserId ? () => hooks.generateUserId!(app) : generateUserId
  const onUserCreated: UserCreatedHook | undefined = hooks.onUserCreated && ((user, context) => hooks.onUserCreated!(user, context, app))
  return {
    ...rest,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: schema, transaction: true },
    secret,
    ...(userId && { generateUserId: userId }),
    ...(onUserCreated && { onUserCreated }),
    ...(mail === false ? { mailer: false as const } : mailer && { mailer }),
    ...(organizationsOptions && { organizations: organizationsOptions }),
    ...(mcp && { mcp }),
  }
}

/** The app's Better Auth from its `auth` settings, built at serve time with only the plugins they turn on. */
export const buildAppAuth = (settings: AuthSettings, input: AppAuthInput) => buildAuth(appAuthOptions(settings, input))
