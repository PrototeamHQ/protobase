import { checkFilter, restrictModel, resolveAccess, type AccessAction, type CheckedFilter, type FieldModel, type FilterExpr, type ResolvedAccess, type ResourceModel } from '@protobase/schema'
import type { Deps } from './deps'
import { checkedFilter } from './filter-input'
import type { Scope } from '@protobase/query'
import { forbidden, notFound } from './problem'
import type { Entry } from './registry'
import { tenantScope } from './tenant'
import type { Row, Session } from './types'

/**
 * Everything one request may do with one resource, resolved once: operations, row filters, and the model as this
 * user sees it. Every user-facing check and query uses `model`; hidden fields do not exist in it.
 */
export type RequestAccess = {
  entry: Entry
  session: Session
  resolved: ResolvedAccess
  /** The full model: for access rules, tenant, soft delete and ETag columns. Never for anything the user names. */
  full: ResourceModel
  /** Readable fields, sensitive ones included; `readOnly` unless writable. For writing, `/meta` and revealing only. */
  readable: ResourceModel
  /** Readable fields without the sensitive ones: everything a request names and every response carries. */
  model: ResourceModel
  deps: Deps
}

const withoutSensitive = (model: ResourceModel): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(Object.entries(model.fields).filter(([, field]) => !field.sensitive)),
})

export const requestAccess = async (deps: Deps, entry: Entry, session: Session): Promise<RequestAccess> => {
  const resolved = await resolveAccess(entry.source, { user: { id: session.user.id, roles: session.user.roles } }, deps.accessOptions)
  const readable = restrictModel(entry.model, resolved)
  return { entry, session, resolved, full: entry.model, readable, model: withoutSensitive(readable), deps }
}

const hasNoAccess = (resolved: ResolvedAccess) => !Object.values(resolved.operations).some(Boolean)

/** 403 when the operation is denied; a resource the user can do nothing with does not exist for them. */
export const requireOperation = (access: RequestAccess, operation: AccessAction) => {
  if (access.resolved.operations[operation]) return
  if (hasNoAccess(access.resolved)) throw notFound(`There is no resource "${access.entry.name}"`)
  throw forbidden('access-denied', `You may not ${operation} ${access.entry.name}`)
}

/**
 * Fields the caller may write on create or update. A field they cannot read is never writable, even when its write rule
 * allows it (nobody writes blind; a sensitive field counts as readable); the tenant column is always set by the server.
 */
export const writableFields = (access: RequestAccess, mode: 'create' | 'update') =>
  access.resolved.writableFields[mode].filter((name) => Object.hasOwn(access.readable.fields, name) && name !== access.full.tenant)

export const visibleFields = (access: RequestAccess): FieldModel[] => Object.values(access.model.fields)

export const andFilters = (filters: Array<CheckedFilter | undefined>): CheckedFilter | undefined => {
  const present = filters.filter((filter): filter is CheckedFilter => filter !== undefined)
  if (present.length < 2) return present[0]
  return { kind: 'and', args: present, span: { start: 0, end: 0 } }
}

/** The row filter that narrows which rows an operation may target: the read filter, plus the operation's own. */
export const targetFilter = (access: RequestAccess, operation: 'read' | 'create' | 'update' | 'delete') =>
  operation === 'read' ? access.resolved.rowFilter.read : andFilters([access.resolved.rowFilter.read, access.resolved.rowFilter[operation]])

/** The query-layer scope for reads: tenant, the access row filter against the full model, soft delete from the full model. */
export const readScope = (access: RequestAccess, fullModel: ResourceModel = access.full): Scope => {
  const tenant = tenantScope(access.entry, access.session)
  const rowFilter = access.resolved.rowFilter.read
  return { ...(tenant && { tenantValue: tenant.tenantValue }), ...(rowFilter && { rowFilter }), fullModel }
}

// Filters from access rules are trusted: they may use columns that are neither filterable nor readable.
const trusted = (model: ResourceModel): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, { ...field, filterable: true }])),
})

const asFilter = (access: RequestAccess, expr: string | FilterExpr, operation: string): CheckedFilter => {
  if (typeof expr === 'string') return checkedFilter(trusted(access.full), expr)!
  const result = checkFilter(trusted(access.full), expr)
  if (!result.ok) throw new Error(`The ${operation} access rule of "${access.entry.name}" returned an invalid filter: ${result.errors[0]!.message}`)
  return result.filter
}

/**
 * The record-level rule of an operation, run with the stored record (and the input of a write). Returns a verdict, or a
 * filter that the caller checks in the database, so its semantics match reads exactly.
 */
export const recordDecision = async (access: RequestAccess, operation: AccessAction, record?: Row, input?: Row): Promise<boolean | CheckedFilter> => {
  const { entry, deps, full, session } = access
  const explicit = entry.source.accessRules[operation] ?? (operation === 'list' ? entry.source.accessRules.read : undefined)
  const fallback = deps.accessOptions.defaultAccess
    ? () => deps.accessOptions.defaultAccess === 'allow'
    : deps.accessOptions.roles
      ? deps.accessOptions.roles.can(`${entry.name}.${operation === 'list' ? 'read' : operation}`)
      : () => true
  const rule = explicit ?? fallback
  const result = await rule({ user: { id: session.user.id, roles: session.user.roles }, model: full, operation, record }, record, input)
  if (typeof result === 'boolean') return result
  return asFilter(access, result, operation)
}
