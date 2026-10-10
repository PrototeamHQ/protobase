import type { Hono } from 'hono'
import type { PageModel } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { ResourceModel, ViewModel } from '@protobase/schema'

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

export type ViewSource = { toModel(): ViewModel }

export type PageSource = { toModel(): PageModel }

export type Admin = Hono<AdminEnv>
