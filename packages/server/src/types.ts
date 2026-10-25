import type { JobDefinition } from './jobs/job-types'
import type { Hono } from 'hono'
import type { PageModel } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { KeyType, ResourceModel, ViewModel } from '@protobase/schema'

export type TenantValue = string | number

export type User = { id: string | number; roles: string[] }

/** The organization a request works in, with organizations on: the same value as `tenant`. */
export type SessionOrganization = { id: TenantValue }

/** A tenant the person is a member of, with the roles they act with there. */
export type Membership = { tenant: TenantValue; roles: string[] }

/** `anonymous` marks a request without a token, served as the project's `anonymous` role. */
export type Session = {
  user: User
  tenant?: TenantValue
  organization?: SessionOrganization
  /**
   * The tenants the person is a member of, each with the roles they act with there, read when a list of a resource
   * with `.tenant(pick, { across: 'memberships' })` needs them. An authenticator sets it only when it knows them; without
   * it, such lists read `tenant` alone. It must never answer a tenant the person is not a member of.
   */
  memberships?: () => Promise<Membership[]>
  anonymous?: true
  /** The outside app acting as the user, such as an MCP client: its OAuth client id and the scopes its token carries. */
  client?: { id: string; scopes: string[] }
  /**
   * The user's own sign-in this request comes with: its session id, when it has one, and whether staff started it as
   * the user. An authenticator sets it only when it knows; without it, what only the user may do, such as registering
   * their devices for notifications, is refused. `strongAt` reads when the sign-in last proved a passkey or a second
   * step, `undefined` when it never did; without it, a reveal that needs a recent strong sign-in is refused.
   */
  signIn?: { session?: string; staff: boolean; strongAt?: () => Promise<Date | undefined> }
}

/**
 * Resolves the caller of a request, or throws a 401 problem (see `unauthorized`). `userIdType` declares the type of
 * the ids of the users it returns, which `.owner()` fields are checked against at startup, such as `'uuid'` for an
 * authenticator that maps the signed-in account to the app's own user row.
 */
export type Authenticator = ((request: Request) => Promise<Session> | Session) & { userIdType?: KeyType }

export type AdminEnv = { Variables: { session: Session } }

export type Row = Record<string, unknown>

export type WriteOperation = 'create' | 'update' | 'delete' | 'undelete'

/** Passed to every pipeline hook, inside the write transaction, after the row was written. */
export type WriteEvent = {
  operation: WriteOperation
  resource: ResourceModel
  user: User
  tenant?: TenantValue
  /** The writer is a visitor without a token, through a public form. */
  anonymous?: true
  before?: Row
  after?: Row
}

/** Extension point of the write pipeline: a hook that throws rolls the write back. */
export type PipelineHook = (event: WriteEvent, trx: Db) => Promise<void>

/**
 * A check of a create or update before its transaction opens, with the body as the caller sent it, for what needs the
 * network, such as resolving a host: it throws to refuse the write.
 */
export type WriteCheck = (write: { resource: string; operation: 'create' | 'update'; body: unknown }) => Promise<void>

/** Where a request came from, as its headers say; proxies set `forwardedFor`, so it is only as trustworthy as they are. */
export type AuditOrigin = { userAgent?: string; forwardedFor?: string }

/** What happened, by whom, to which value. It never carries the value itself. */
export type FieldRevealedEvent = {
  type: 'field.revealed'
  /** ISO 8601, when the server answered. */
  at: string
  actor: { id: string | number; roles: string[] }
  /** The caller's tenant (organization), when the resource has one. */
  tenant?: TenantValue
  resource: string
  /** The record's key as its URL has it (composite keys joined with a comma). */
  recordKey: string
  field: string
  origin: AuditOrigin
}

/** Someone with a global role started working in an organization they are not a member of. */
export type OrganizationEnteredEvent = {
  type: 'organization.entered'
  /** ISO 8601, when the server answered. */
  at: string
  /** Their global roles, which let them in. */
  actor: { id: string | number; roles: string[] }
  organization: TenantValue
  origin: AuditOrigin
}

export type AuditEvent = FieldRevealedEvent | OrganizationEnteredEvent

/**
 * Where audit events go. `publish` resolves once the event is accepted; when it rejects, the request that caused the
 * event fails, so nothing is revealed without its event. A real queue replaces the console one through
 * `options.audit` in `protobase.config.ts`.
 */
export type AuditQueue = { publish(event: AuditEvent): Promise<void> }

export type ScanGuardMode = 'reject' | 'warn' | 'off'

export type ViewSource = { toModel(): ViewModel }

export type PageSource = { toModel(): PageModel }

/** The admin API, and the jobs it needs a worker to run: the delivery of resource events. */
export type Admin = Hono<AdminEnv> & { jobs: JobDefinition[] }
