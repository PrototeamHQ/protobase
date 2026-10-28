import { checkFilter, restrictModel, resolveAccess, where, type AccessAction, type CheckedFilter, type FieldModel, type FilterExpr, type FormModel, type ResolvedAccess, type ResourceModel } from '@protobase/schema'
import type { Deps } from './deps'
import { maskEncrypted } from './encryption/mask-stored'
import { checkedFilter } from './filter-input'
import { checkOwnerId } from './owner-id'
import { parentReads } from './parent-reads'
import type { ParentRead, Scope } from '@protobase/query'
import { forbidden, notFound, unauthorized } from './problem'
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
  /** The parents the caller must read for a record to be seen (`.parent(fk, 'read')`); every read keeps to them. */
  parents: ParentRead[]
  deps: Deps
}

// Access rules see the organization a request works in, with organizations on.
const organizationOf = (session: Session) => (session.organization ? { organization: session.organization } : {})

const withoutSensitive = (model: ResourceModel): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(Object.entries(model.fields).filter(([, field]) => !field.sensitive)),
})

// A caller without a token creates only through a public form, which has the rate limit and the bot check: anywhere
// else (the resources API, batches, uploads, `/meta`) the anonymous role's `create` does not exist.
const withoutAnonymousCreate = (resolved: ResolvedAccess, session: Session): ResolvedAccess =>
  session.anonymous ? { ...resolved, operations: { ...resolved.operations, create: false }, writableFields: { ...resolved.writableFields, create: [] } } : resolved

// Through a public form a visitor creates the form's fields, which they need not read: the one write made blind, since
// the visitor never sees the record it makes. They count as readable so the write can name them; nothing is read back.
const throughForm = (resolved: ResolvedAccess, form: FormModel): ResolvedAccess => {
  const create = resolved.writableFields.create.filter((name) => form.fields.includes(name))
  return { ...resolved, readableFields: [...new Set([...resolved.readableFields, ...create])], writableFields: { create, update: [] } }
}

const noAccess: ResolvedAccess = {
  operations: { read: false, list: false, create: false, update: false, delete: false },
  recordChecks: [],
  readableFields: [],
  writableFields: { create: [], update: [] },
  rowFilter: {},
}

// A resource a `Settings` block shows holds each person's own settings: every caller, an admin holding `*` too, reads
// and writes only the records they own, and a caller without a token none.
const ownOnly = (resolved: ResolvedAccess, entry: Entry, session: Session): ResolvedAccess => {
  if (session.anonymous) return noAccess
  const own = checkFilter(trusted(entry.model), where.eq(entry.model.owner!, session.user.id as string))
  if (!own.ok) throw new Error(`The owner filter of "${entry.name}" is invalid: ${own.errors[0]!.message}`)
  const { rowFilter } = resolved
  const narrowed = (operation: keyof typeof rowFilter) => andFilters([rowFilter[operation], own.filter])
  return { ...resolved, rowFilter: { read: narrowed('read'), create: narrowed('create'), update: narrowed('update'), delete: narrowed('delete') } }
}

/**
 * `form` is the public form a visitor sends, the only way a caller without a token creates. `chain` holds the resources
 * whose parents led to this one (see `parentReads`).
 */
export const requestAccess = async (deps: Deps, entry: Entry, session: Session, form?: FormModel, chain: readonly string[] = []): Promise<RequestAccess> => {
  const all = await resolveAccess(entry.source, { user: { id: session.user.id, roles: session.user.roles }, ...organizationOf(session) }, deps.accessOptions)
  const allowed = form ? throughForm(all, form) : withoutAnonymousCreate(all, session)
  const resolved = deps.settingsResources.has(entry.name) ? ownOnly(allowed, entry, session) : allowed
  checkOwnerId(entry, session.user, resolved)
  const readable = restrictModel(entry.model, resolved)
  const parentAccess = async (parent: Entry, along: readonly string[]) => {
    const access = await requestAccess(deps, parent, session, undefined, along)
    return { resolved: access.resolved, full: access.full, scope: ownScope(access) }
  }
  const parents = await parentReads(entry, session, chain, parentAccess, deps.registry.find)
  return { entry, session, resolved, full: entry.model, readable, model: withoutSensitive(readable), parents, deps }
}

const hasNoAccess = (resolved: ResolvedAccess) => !Object.values(resolved.operations).some(Boolean)

/**
 * 403 when the operation is denied, 401 for a request without a token; a resource the user can do nothing with does not
 * exist for them.
 */
export const requireOperation = (access: RequestAccess, operation: AccessAction) => {
  if (access.resolved.operations[operation]) return
  if (hasNoAccess(access.resolved)) throw notFound(`There is no resource "${access.entry.name}"`)
  if (access.session.anonymous) throw unauthorized(`Send a bearer token to ${operation} ${access.entry.name}`)
  throw forbidden('access-denied', `You may not ${operation} ${access.entry.name}`)
}

// A field the caller cannot read is written blind only when the field's own rule for the write grants it, never by a
// rule it follows from its resource, so restricting a field's reads does not open it to every writer of the resource.
// A file field is never write-only: its upload and its stored-value no-op both need the field readable. Nor is the
// position field: checking a new rank against its dependencies compares the stored ranks the caller cannot read.
const writesBlind = (access: RequestAccess, name: string, mode: 'create' | 'update') =>
  access.entry.source.fieldAccess()[name]?.[mode] !== undefined && !access.full.fields[name]?.file && name !== access.full.position?.field

/**
 * Fields the caller may write on create or update: those they read (a sensitive field counts as read), and write-only
 * ones, which they cannot read but whose own write rule allows them (see `writesBlind`). The tenant column is always set
 * by the server.
 */
export const writableFields = (access: RequestAccess, mode: 'create' | 'update') =>
  access.resolved.writableFields[mode].filter((name) => (Object.hasOwn(access.readable.fields, name) || writesBlind(access, name, mode)) && name !== access.full.tenant)

/** The write-only fields: those the caller may write on create or on update but not read, in the model's order. */
export const writeOnlyFields = (access: RequestAccess) => {
  const writable = new Set([...writableFields(access, 'create'), ...writableFields(access, 'update')])
  return Object.keys(access.full.fields).filter((name) => writable.has(name) && !Object.hasOwn(access.readable.fields, name))
}

export const visibleFields = (access: RequestAccess): FieldModel[] => Object.values(access.model.fields)

export const andFilters = (filters: Array<CheckedFilter | undefined>): CheckedFilter | undefined => {
  const present = filters.filter((filter): filter is CheckedFilter => filter !== undefined)
  if (present.length < 2) return present[0]
  return { kind: 'and', args: present, span: { start: 0, end: 0 } }
}

/** The row filter that narrows which rows an operation may target: the read filter, plus the operation's own. */
export const targetFilter = (access: RequestAccess, operation: 'read' | 'create' | 'update' | 'delete') =>
  operation === 'read' ? access.resolved.rowFilter.read : andFilters([access.resolved.rowFilter.read, access.resolved.rowFilter[operation]])

/**
 * The query-layer scope of the caller's own tenant: it, the access row filter and the parents the caller reads against
 * the full model, soft delete from the full model.
 */
export const ownScope = (access: RequestAccess, fullModel: ResourceModel = access.full): Scope => {
  const tenant = tenantScope(access.entry, access.session)
  const rowFilter = access.resolved.rowFilter.read
  return { ...(tenant && { tenantValue: tenant.tenantValue }), ...(rowFilter && { rowFilter }), ...(access.parents.length > 0 && { parents: access.parents }), fullModel }
}

// Filters from access rules are trusted: they may use columns that are neither filterable nor readable, except an
// encrypted field, whose ciphertext a filter would compare as if it were the value.
export const trusted = (model: ResourceModel): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, { ...field, filterable: !field.encrypted }])),
})

const asFilter = (access: RequestAccess, expr: string | FilterExpr, operation: string): CheckedFilter => {
  if (typeof expr === 'string') return checkedFilter(trusted(access.full), expr)!
  const result = checkFilter(trusted(access.full), expr)
  if (!result.ok) throw new Error(`The ${operation} access rule of "${access.entry.name}" returned an invalid filter: ${result.errors[0]!.message}`)
  return result.filter
}

/**
 * The record-level rule of an operation, run with the stored record (and the input of a write). Returns a verdict, or a
 * filter that the caller checks in the database, so its semantics match reads exactly. The rule gets a set encrypted
 * field of the stored record as `encrypted`, never its ciphertext; the input it gets as written.
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
  const stored = record && maskEncrypted(full, record)
  const result = await rule({ user: { id: session.user.id, roles: session.user.roles }, ...organizationOf(session), model: full, operation, record: stored }, stored, input)
  if (typeof result === 'boolean') return result
  return asFilter(access, result, operation)
}
