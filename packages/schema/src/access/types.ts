import type { FilterExpr, ResourceModel } from '../model'

/** An operation on a resource that access rules decide; `list` falls back to the `read` rule. */
export type AccessAction = 'list' | 'read' | 'create' | 'update' | 'delete'

/** The signed-in user as access rules see it; roles come from the auth user record. */
export type AccessUser = {
  /** The user's id, which `.own` compares with the resource's `.owner(...)` field. */
  id?: string | number
  /** The user's roles, with organizations those of the membership too. */
  roles?: readonly string[]
  [key: string]: unknown
}

/** What an access rule is given: who asks, for which operation, and where. */
export type AccessContext = {
  /** Always set by the server; optional in the type so rules stay callable with a bare context. */
  user?: AccessUser
  /** The operation being decided. */
  operation?: AccessAction
  /** The record the operation is on, when there is one. */
  record?: unknown
  /** With organizations, the one the request works in; `.tenant` resources are scoped to it already. */
  organization?: {
    /** The organization's id. */
    id: string | number
  }
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

/** A field's own rules, `.access({ read, create, update })` on the field; an operation without one follows the resource. */
export type FieldAccess = {
  /** Whether the caller may see the field. */
  read?: FieldRule
  /** Whether the caller may set the field when creating a record. */
  create?: FieldRule
  /** Whether the caller may change the field when updating a record. */
  update?: FieldRule
}
