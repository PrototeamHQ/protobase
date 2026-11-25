import type { OrganizationOptions } from 'better-auth/plugins/organization'
import { scopedDb, type Db, type Organization, type ScopedDb } from '@protobase/query'
import type { Mailer } from '../mail/smtp-mailer'
import { buildAuth, type CreateAuthOptions, type UserCreatedHook } from './create-auth'
import type { McpAuthOptions } from './mcp/mcp-plugins'
import { organizationsEnabled, type OrganizationsOptions } from './organizations/options'
import type { StoredMember, StoredOrganization } from './organizations/store'
import type { OrganizationsOff } from './organizations/kept-organizations'
import type { TenantValue } from '../types'
import type { AddVerifier } from '../personal-mail/verifiers/sender-address-verifier'
import { senderVerifierList } from '../personal-mail/verifiers/verifier-list'
import { noOrganizationTables, organizationTables } from '../organization-scope/organization-tables'
import { modulesOf } from './names/modules-on'
import { resolveNames } from './names/resolve-names'

/**
 * What every hook of the project's own gets as its last argument: the app's database, kept to the organization the
 * hook is about on the tables whose rows belong to one (`ScopedDb`), such as the new organization in
 * `onOrganizationCreated`; a hook about no organization, such as `onUserCreated`, sees none of their rows.
 */
export type HookContext = { db: ScopedDb }

/** The context of a hook about `organization`. */
type HookContexts = (organization: Organization) => HookContext

// The organization a Better Auth organization hook is about: its input's organization, else the member's or the
// invitation's, and none before an organization is made.
const organizationOfHook = (input: unknown): Organization => {
  const { organization, member, invitation } = (input ?? {}) as { organization?: { id?: unknown } | null; member?: { organizationId?: unknown }; invitation?: { organizationId?: unknown } }
  const id = organization?.id ?? member?.organizationId ?? invitation?.organizationId
  return typeof id === 'string' ? id : undefined
}

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
  /**
   * Adds the app's ways to prove a From address with `add_verifier`, such as a hosting platform's test-mail check
   * (`SenderAddressVerifier`); runs once as the app starts. Needs `personalMail`.
   */
  senderVerifiers?: (add_verifier: AddVerifier) => void
}

/**
 * `auth` in `protobase.config.ts`: the sign-in settings as data. The store is the app's own database, in `schema`;
 * the hooks and a mailer of the project's own are found in auth/hooks.ts and auth/mailer.ts.
 */
export type AuthSettings = Omit<CreateAuthOptions, 'database' | 'secret' | 'generateUserId' | 'onUserCreated' | 'mailer' | 'organizations' | 'organizationsOff' | 'mcp' | 'workflowConnections' | 'senderVerifiers'> & {
  /** Signs cookies and encrypts the JWT private keys, such as `PROTOBASE_SECRET`. Generate with `openssl rand -base64 32`. */
  secret?: string
  /** The schema of the auth store in the app's database; default `auth`. */
  schema?: string
  /** `'uuid'` gives new users a random UUID, and makes every id column of the store a `uuid`; `generateUserId` in the hooks takes the ids from the app instead. */
  generateUserId?: 'uuid'
  /** `false` turns mail off whatever the environment says; default SMTP from `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`. */
  mailer?: false
  /**
   * Organizations (see `OrganizationsOptions`): `enabled` turns them on; their hooks are in the hooks module. Turning them
   * off sets `enabled: false` and keeps `default`, whose organization then stands in for every one.
   */
  organizations?: Omit<OrganizationsOptions, 'generateId' | 'onCreated' | 'beforeDelete' | 'hooks'> & { enabled: boolean }
  /** Turns on the OAuth provider for MCP clients: `true`, or the endpoint's `path` and the `connectPage`. */
  mcp?: true | Omit<McpAuthOptions, 'fetchClientMetadata'>
}

export type AppAuthInput = {
  /** The app's database: sign-in queries run through it as it is, its plugins included; each hook gets it kept to the organization it is about. */
  db: Db
  hooks?: AuthHooks
  /** A mailer of the project's own, in place of the default. */
  mailer?: Mailer
  /** The connections the app's workflow plugins declare, which people connect accounts through. */
  workflowConnections?: CreateAuthOptions['workflowConnections']
  /** `authenticate.tenant`, which pins the default organization while organizations are off after being on. */
  tenant?: TenantValue
}

const organizationOptions = (organizations: AuthSettings['organizations'], hooks: AuthHooks, app: HookContexts): OrganizationsOptions | undefined => {
  if (!organizationsEnabled(organizations)) return undefined
  const { enabled: _, ...options } = organizations!
  const own = hooks.organizationHooks ?? {}
  const betterAuthHooks = Object.fromEntries(Object.entries(own).map(([name, hook]) => [name, (input: unknown) => (hook as (input: unknown, app: HookContext) => unknown)(input, app(organizationOfHook(input)))]))
  return {
    ...options,
    ...(hooks.generateOrganizationId && { generateId: () => hooks.generateOrganizationId!(app(undefined)) }),
    ...(hooks.onOrganizationCreated && { onCreated: (input) => hooks.onOrganizationCreated!(input, app(input.organization.id)) }),
    ...(hooks.beforeOrganizationDeleted && { beforeDelete: (organization) => hooks.beforeOrganizationDeleted!(organization, app(organization.id)) }),
    ...(Object.keys(betterAuthHooks).length > 0 && { hooks: betterAuthHooks as OrganizationHooks }),
  }
}

// What the settings say of organizations while they are off, which the auth instance pins the default organization
// from while the store still holds organizations (`pinnedOrganization`).
const organizationsOffOf = (organizations: AuthSettings['organizations'], tenant: TenantValue | undefined): OrganizationsOff => ({
  ...(organizations?.default && { default: organizations.default }),
  ...(organizations?.existingUsersRole !== undefined && { existingUsersRole: organizations.existingUsersRole }),
  ...(tenant !== undefined && { tenant }),
})

/** createAuth's options for the `auth` settings, the store in the app's own database. */
export const appAuthOptions = (settings: AuthSettings, { db, hooks = {}, mailer, workflowConnections, tenant }: AppAuthInput): CreateAuthOptions => {
  const { schema = 'auth', secret, generateUserId, mailer: mail, organizations, mcp, ...rest } = settings
  if (!secret) throw new Error("the auth secret is not set: give it the app's secret, PROTOBASE_SECRET, made with `openssl rand -base64 32`")
  // The store's tables as the hooks see them; sign-in itself reads the store through `db` as it is.
  const on = organizationsEnabled(organizations)
  const scope = on ? organizationTables(resolveNames({ schema, tables: rest.tables, modules: modulesOf({ ...rest, mcp, organizations: on }) })) : noOrganizationTables
  const app: HookContexts = (organization) => ({ db: scopedDb(db, scope, organization) })
  const organizationsOptions = organizationOptions(organizations, hooks, app)
  const userId = hooks.generateUserId ? () => hooks.generateUserId!(app(undefined)) : generateUserId
  const onUserCreated: UserCreatedHook | undefined = hooks.onUserCreated && ((user, context) => hooks.onUserCreated!(user, context, app(undefined)))
  const verifiers = senderVerifierList()
  hooks.senderVerifiers?.(verifiers.add_verifier)
  const senderVerifiers = verifiers.freeze()
  return {
    ...rest,
    database: { db, type: 'postgres', schemaName: schema, transaction: true },
    secret,
    ...(userId && { generateUserId: userId }),
    ...(onUserCreated && { onUserCreated }),
    ...(mail === false ? { mailer: false as const } : mailer && { mailer }),
    ...(organizationsOptions ? { organizations: organizationsOptions } : { organizationsOff: organizationsOffOf(organizations, tenant) }),
    ...(mcp && { mcp }),
    ...(workflowConnections && { workflowConnections }),
    ...(senderVerifiers.length > 0 && { senderVerifiers }),
  }
}

/** The app's Better Auth from its `auth` settings, built at serve time with only the plugins they turn on. */
export const buildAppAuth = (settings: AuthSettings, input: AppAuthInput) => buildAuth(appAuthOptions(settings, input))
