import type { FilterExpr, ResourceModel } from '../model'

export type AccessAction = 'list' | 'read' | 'create' | 'update' | 'delete'

/** The signed-in user as access rules see it; roles come from the auth user record. */
export type AccessUser = { id?: string | number; roles?: readonly string[]; [key: string]: unknown }

export type AccessContext = {
  /** Always set by the server; optional in the type so rules stay callable with a bare context. */
  user?: AccessUser
  operation?: AccessAction
  record?: unknown
  /** Set by the resolver; scoped capabilities (`.own`) need `model.owner`. */
  model?: ResourceModel
  [key: string]: unknown
}

/**
 * What an access function may return: a verdict, or a filter that is ANDed into the query.
 * The filter is AIP-160 text or a `FilterExpr` built with `where`.
 */
export type AccessResult = boolean | string | FilterExpr

/**
 * A rule at the resource level. Without a record it decides the operation and may return a row
 * filter; with `(ctx, record, input)` it is a record-level check. Rules that need the record
 * may throw a `TypeError` when it is missing, which marks the operation as record-checked.
 */
export type AccessFn<R = any> = (
  ctx: AccessContext,
  record?: R,
  input?: Partial<R>,
) => AccessResult | Promise<AccessResult>

/** A field rule is role-based: it never sees a record, so readable columns are fixed per request. */
export type FieldRule = (ctx: AccessContext) => AccessResult | Promise<AccessResult>

export type FieldAccess = { read?: FieldRule; create?: FieldRule; update?: FieldRule }
