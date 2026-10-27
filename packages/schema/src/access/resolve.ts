import { checkFilter, evaluateFilter, type EvaluateOptions } from '../filter'
import type { CheckedFilter, FilterExpr, ResourceModel } from '../model'
import { andResults, normalize } from './combine'
import { recordProbe } from './record-probe'
import { anonymousRole } from './role-entry'
import type { Rule } from './rule'
import type { AccessAction, AccessContext, AccessFn, AccessUser, FieldAccess } from './types'

/** What the resolver needs from a resource; `ResourceBuilder` satisfies it. */
export type AccessSource = {
  /** The resource's model. */
  toModel: () => ResourceModel
  /** The resource's rules, by operation (`.access(...)`). */
  accessRules: Partial<Record<AccessAction, AccessFn>>
  /** The fields' own rules, by field name. */
  fieldAccess: () => Record<string, FieldAccess>
}

/** How `resolveAccess` decides what the resource's rules leave open. */
export type ResolveOptions = {
  /**
   * The project's roles. When given, an operation without a rule is denied unless the user's
   * roles grant `<resource>.<action>` (so admin's `*` still passes). Fields without a rule
   * follow their resource, within the fields the roles list for the capability. With an `anonymous` role, a caller
   * holding only that role needs its capability even where a rule or `defaultAccess` would allow.
   */
  roles?: {
    /** The rule allowing a capability, as `defineRoles` makes it. */
    can: (capability: any) => Rule
    /** The fields the user's roles list for a capability, or `undefined` for every field. */
    fields?: (user: AccessUser, capability: string) => readonly string[] | undefined
    /** The roles by name, to tell whether the project has an `anonymous` role. */
    definitions?: Record<string, unknown>
    /** Whether the user's roles grant all of a capability, as `defineRoles` makes it; the gate of API functions. */
    holds?: (user: AccessUser, capability: any) => boolean
  }
  /**
   * Overrides what an operation without a rule does. Without `roles` the default is `allow`,
   * the single-admin case; with `roles` it is the capability check above. Choosing `allow`
   * together with `roles` is an explicit opt-in, see `accessWarnings`.
   */
  defaultAccess?: 'allow' | 'deny'
}

/** Startup warnings for risky option combinations; the caller decides how to report them. */
export const accessWarnings = (options: ResolveOptions) =>
  options.roles && options.defaultAccess === 'allow'
    ? ['Roles are configured but defaultAccess is "allow": operations without an access rule are open to every user.']
    : []

/** An operation a row filter applies to. */
export type RowFilterOperation = 'read' | 'create' | 'update' | 'delete'

/** What one request may do with one resource, as `resolveAccess` works it out. */
export type ResolvedAccess = {
  /** Whether each operation is allowed at all; one in `recordChecks` or `rowFilter` only for some records. */
  operations: Record<AccessAction, boolean>
  /** Operations whose rule needs the record (or input); check them with `checkRecord`. */
  recordChecks: AccessAction[]
  /** Columns the caller may see; everything else must be left out of results, filters, sorts and search. */
  readableFields: string[]
  /** Columns the caller may write. */
  writableFields: {
    /** Those a create may set. */
    create: string[]
    /** Those an update may change. */
    update: string[]
  }
  /** ANDed into queries (`read` covers list and read) or checked against records (`create`). */
  rowFilter: Partial<Record<RowFilterOperation, CheckedFilter>>
}

const operations: AccessAction[] = ['read', 'list', 'create', 'update', 'delete']

const capabilityOf = (model: ResourceModel, operation: AccessAction) => `${model.name}.${operation === 'list' ? 'read' : operation}`

// `list` falls back to the `read` rule.
const explicitRule = (source: AccessSource, operation: AccessAction) => source.accessRules[operation] ?? (operation === 'list' ? source.accessRules.read : undefined)

// A caller holding only the project's anonymous role: nothing but that role's capabilities opens anything to them.
const anonymousCaller = (options: ResolveOptions, user: AccessUser | undefined) => {
  const roles = user?.roles ?? []
  return Object.hasOwn(options.roles?.definitions ?? {}, anonymousRole) && roles.length > 0 && roles.every((role) => role === anonymousRole)
}

// Without a rule, the options decide: a boolean, or the capability check when roles are configured, which is all an
// anonymous caller gets.
const ruleFor = (source: AccessSource, model: ResourceModel, operation: AccessAction, options: ResolveOptions, anonymous = false): AccessFn | boolean => {
  const explicit = explicitRule(source, operation)
  if (explicit) return explicit
  if (anonymous) return options.roles!.can(capabilityOf(model, operation))
  if (options.defaultAccess) return options.defaultAccess === 'allow'
  if (!options.roles) return true
  return options.roles.can(capabilityOf(model, operation))
}

// Filters from access rules are trusted, so they may use columns that are not `filterable` for users. An encrypted field
// holds ciphertext, which a filter would compare as if it were the value, so a rule filtering on one is refused.
const checked = (model: ResourceModel, expr: FilterExpr, operation: string) => {
  const trusted = { ...model, fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, { ...field, filterable: !field.encrypted }])) }
  const result = checkFilter(trusted, expr)
  if (!result.ok) throw new Error(`The ${operation} access rule of "${model.name}" returned an invalid filter: ${result.errors[0]!.message}`)
  return result.filter
}

// A rule is called with a probe for the record and the input: one that reads either, or throws a TypeError without
// them, needs the record. The probe stays armed until an async rule settles.
const decide = async (rule: AccessFn, ctx: AccessContext) => {
  const probe = recordProbe()
  try {
    return normalize(await rule({ ...ctx, record: probe.value }, probe.value, probe.value))
  } catch (error) {
    if (error instanceof TypeError) return 'record' as const
    throw error
  } finally {
    probe.disarm()
  }
}

const verdict = async (rule: ((ctx: AccessContext) => unknown) | undefined, ctx: AccessContext, fallback: boolean, what: string) => {
  if (!rule) return fallback
  const result = normalize((await rule(ctx)) as never)
  if (typeof result !== 'boolean') throw new Error(`${what} must be role-based and return a boolean; a row filter (.own, .team) cannot apply to a column`)
  return result
}

/**
 * Resolves everything a request may do with a resource: operations, row filters, readable and
 * writable columns. Pure with respect to the database; downstream code applies the result
 * and must not re-decide access.
 */
export const resolveAccess = async (
  source: AccessSource,
  ctx: Omit<AccessContext, 'model' | 'operation'> & { user: NonNullable<AccessContext['user']> },
  options: ResolveOptions = {},
): Promise<ResolvedAccess> => {
  const model = source.toModel()
  const allowed = {} as Record<AccessAction, boolean>
  const recordChecks: AccessAction[] = []
  const filters: Partial<Record<AccessAction, FilterExpr>> = {}

  const anonymous = anonymousCaller(options, ctx.user)

  for (const operation of operations) {
    if (operation === 'list' && !source.accessRules.list) {
      allowed.list = allowed.read
      if (recordChecks.includes('read')) recordChecks.push('list')
      continue
    }
    const context = { ...ctx, model, operation }
    const rule = ruleFor(source, model, operation, options, anonymous)
    const decision = typeof rule === 'boolean' ? rule : await decide(rule, context)
    // An explicit rule may allow anyone, so an anonymous caller's capability, with its row filter, is ANDed in.
    const required = anonymous && explicitRule(source, operation) ? normalize(await options.roles!.can(capabilityOf(model, operation))(context)) : true
    if (required === false) {
      allowed[operation] = false
    } else if (decision === 'record') {
      allowed[operation] = true
      recordChecks.push(operation)
      if (required !== true) filters[operation] = required
    } else {
      const combined = andResults(decision, required)
      allowed[operation] = combined !== false
      if (typeof combined === 'object') filters[operation] = combined
    }
  }

  const fieldRules = source.fieldAccess()
  const fieldContext = (operation: AccessAction) => ({ ...ctx, model, operation })
  // The fields the roles list for each capability; `undefined` leaves every field to its rule.
  const listed = (operation: 'read' | 'create' | 'update') => options.roles?.fields?.(ctx.user, capabilityOf(model, operation))
  const lists = { read: listed('read'), create: listed('create'), update: listed('update') }
  const inList = (list: readonly string[] | undefined, name: string) => list === undefined || list.includes(name)
  const names = Object.keys(model.fields)
  const readableFields: string[] = []
  const writable = { create: [] as string[], update: [] as string[] }
  for (const name of names) {
    const rules = fieldRules[name]
    const field = model.fields[name]!
    if ((allowed.list || allowed.read) && inList(lists.read, name)) {
      if (await verdict(rules?.read, fieldContext('read'), true, `The read rule of field "${name}"`)) readableFields.push(name)
    }
    for (const operation of ['create', 'update'] as const) {
      if (!allowed[operation] || field.readOnly || !inList(lists[operation], name)) continue
      if (await verdict(rules?.[operation], fieldContext(operation), true, `The ${operation} rule of field "${name}"`)) writable[operation].push(name)
    }
  }

  const readFilter = filters.list && filters.read ? andResults(filters.list, filters.read) : (filters.read ?? filters.list)
  const rowFilter: ResolvedAccess['rowFilter'] = {}
  const byOperation: Array<[RowFilterOperation, boolean | FilterExpr | undefined]> = [
    ['read', readFilter],
    ['create', filters.create],
    ['update', filters.update],
    ['delete', filters.delete],
  ]
  for (const [operation, filter] of byOperation) {
    if (filter && typeof filter === 'object') rowFilter[operation] = checked(model, filter, operation)
    else if (filter === false) allowed[operation === 'read' ? 'read' : operation] = false
  }

  return { operations: allowed, recordChecks, readableFields, writableFields: writable, rowFilter }
}

/**
 * Record-level check for an operation: runs the rule with the record (and input) and evaluates
 * a returned filter against it. Creates are checked against the input, other operations
 * against the existing record.
 */
export const checkRecord = async (
  source: AccessSource,
  ctx: Omit<AccessContext, 'model' | 'operation' | 'record'>,
  operation: AccessAction,
  record: Record<string, unknown> | undefined,
  input?: Record<string, unknown>,
  options: ResolveOptions & EvaluateOptions = {},
): Promise<boolean> => {
  const model = source.toModel()
  const anonymous = anonymousCaller(options, ctx.user as AccessContext['user'])
  const found = ruleFor(source, model, operation, options, anonymous)
  const rule = anonymous && explicitRule(source, operation) ? options.roles!.can(capabilityOf(model, operation)).and(found as AccessFn) : found
  if (typeof rule === 'boolean') return rule
  const result = normalize(await rule({ ...ctx, model, operation, record }, record, input))
  if (typeof result === 'boolean') return result
  const subject = operation === 'create' ? input : record
  if (!subject) throw new Error(`Checking a ${operation} filter for "${model.name}" needs ${operation === 'create' ? 'the input' : 'the record'}`)
  return evaluateFilter(checked(model, result, operation), subject, options)
}

/** Names of the fields a checked filter refers to, so callers can reject filters on unreadable columns. */
export const fieldsUsedBy = (filter: CheckedFilter): string[] => {
  switch (filter.kind) {
    case 'and':
    case 'or':
      return [...new Set(filter.args.flatMap(fieldsUsedBy))]
    case 'not':
      return fieldsUsedBy(filter.arg)
    case 'search':
      return []
    default:
      return [filter.field.name]
  }
}
