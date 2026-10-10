import type { Hono } from 'hono'
import type { PageModel } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { ResolveOptions, ResourceModel, ViewModel } from '@protobase/schema'
import type { AssistantOptions } from './assistant/assistant-settings'
import type { RuntimeOptions } from './runtime/runtime-settings'

export type TenantValue = string | number

export type User = { id: string | number; roles: string[] }

export type Session = { user: User; tenant?: TenantValue }

/** Resolves the caller of a request, or throws a 401 problem (see `unauthorized`). */
export type Authenticator = (request: Request) => Promise<Session> | Session

export type AdminEnv = { Variables: { session: Session } }

export type Row = Record<string, unknown>

export type WriteOperation = 'create' | 'update' | 'delete' | 'undelete'

/** Passed to every pipeline hook, inside the write transaction, after the row was written. */
export type WriteEvent = {
  operation: WriteOperation
  resource: ResourceModel
  user: User
  tenant?: TenantValue
  before?: Row
  after?: Row
}

/** Extension point of the write pipeline: a hook that throws rolls the write back. */
export type PipelineHook = (event: WriteEvent, trx: Db) => Promise<void>

/** What happened, by whom, to which value. It never carries the value itself. */
export type AuditEvent = {
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
  /** Where the request came from, as its headers say; proxies set `forwardedFor`, so it is only as trustworthy as they are. */
  origin: { userAgent?: string; forwardedFor?: string }
}

/**
 * Where audit events go. `publish` resolves once the event is accepted; when it rejects, the request that caused the
 * event fails, so nothing is revealed without its event. A real queue replaces the console one through
 * `options.audit` in `protobase.config.ts`.
 */
export type AuditQueue = { publish(event: AuditEvent): Promise<void> }

export type ScanGuardMode = 'reject' | 'warn' | 'off'

export type AdminOptions = {
  /** Default `/api/v1`. */
  basePath?: string
  /** Applied to every request's transaction with SET LOCAL. Default 15000. */
  statementTimeoutMs?: number
  /** List shapes that would sequentially scan a table of more than `seqScanRows` rows (default 10000). Default mode `reject`. */
  scanGuard?: { mode?: ScanGuardMode; seqScanRows?: number }
  /** Runs inside the write transaction after each create, update and delete. */
  writeHooks?: PipelineHook[]
  /** The project's roles (from `defineRoles`): an operation without an access rule needs the matching capability. */
  roles?: ResolveOptions['roles']
  /** What an operation without a rule does; overrides the capability check. Without `roles` the default is allow. */
  defaultAccess?: ResolveOptions['defaultAccess']
  /** Whether list items carry their `permissions` (update, delete): true by default, or `{ except: [...] }` for resources that opt out. */
  rowPermissions?: boolean | { except: string[] }
  /** Receives an event for every reveal of a sensitive field. Default: printed to the console, nothing kept. */
  audit?: AuditQueue
  /** Called with every error the API turns into a 500, so the host can report it. */
  onUnhandledError?: (error: unknown) => void
  /** The assistant in the admin app's dock: a backend elsewhere or the built-in one (see `AssistantOptions`); `false` turns it off. */
  assistant?: AssistantOptions | false
  /** The runtime updates endpoint behind the top bar's update button (see `RuntimeOptions`); `false` turns it off. */
  runtime?: RuntimeOptions | false
}

export type ViewSource = { toModel(): ViewModel }

export type PageSource = { toModel(): PageModel }

export type Admin = Hono<AdminEnv>
