import { checkFilter, evaluateFilter, type EvaluateOptions } from '../filter'
import type { CheckedFilter, FilterExpr, ResourceModel } from '../model'
import { andResults, normalize } from './combine'
import type { Rule } from './rule'
import type { AccessAction, AccessContext, AccessFn, FieldAccess } from './types'

/** What the resolver needs from a resource; `ResourceBuilder` satisfies it. */
export type AccessSource = {
  toModel: () => ResourceModel
  accessRules: Partial<Record<AccessAction, AccessFn>>
  fieldAccess: () => Record<string, FieldAccess>
}

export type ResolveOptions = {
  /**
   * The project's roles. When given, an operation without a rule is denied unless the user's
   * roles grant `<resource>.<action>` (so admin's `*` still passes). Fields without a rule
   * follow their resource.
   */
  roles?: { can: (capability: any) => Rule }
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

export type RowFilterOperation = 'read' | 'create' | 'update' | 'delete'

export type ResolvedAccess = {
  operations: Record<AccessAction, boolean>
  /** Operations whose rule needs the record (or input); check them with `checkRecord`. */
  recordChecks: AccessAction[]
  /** Columns the caller may see; everything else must be left out of results, filters, sorts and search. */
  readableFields: string[]
  writableFields: { create: string[]; update: string[] }
  /** ANDed into queries (`read` covers list and read) or checked against records (`create`). */
  rowFilter: Partial<Record<RowFilterOperation, CheckedFilter>>
}

const operations: AccessAction[] = ['read', 'list', 'create', 'update', 'delete']

// `list` falls back to the `read` rule. Without a rule, the options decide: a boolean, or the
// capability check when roles are configured.
const ruleFor = (source: AccessSource, model: ResourceModel, operation: AccessAction, options: ResolveOptions): AccessFn | boolean => {
  const explicit = source.accessRules[operation] ?? (operation === 'list' ? source.accessRules.read : undefined)
  if (explicit) return explicit
  if (options.defaultAccess) return options.defaultAccess === 'allow'
  if (!options.roles) return true
  return options.roles.can(`${model.name}.${operation === 'list' ? 'read' : operation}`)
}

// Filters from access rules are trusted, so they may use columns that are not `filterable` for users.
const checked = (model: ResourceModel, expr: FilterExpr, operation: string) => {
  const trusted = { ...model, fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, { ...field, filterable: true }])) }
  const result = checkFilter(trusted, expr)
  if (!result.ok) throw new Error(`The ${operation} access rule of "${model.name}" returned an invalid filter: ${result.errors[0]!.message}`)
  return result.filter
}

// A rule that needs the record throws a TypeError when called without one.
const decide = async (rule: AccessFn, ctx: AccessContext) => {
  try {
    return normalize(await rule(ctx))
  } catch (error) {
    if (error instanceof TypeError) return 'record' as const
    throw error
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

  for (const operation of operations) {
    if (operation === 'list' && !source.accessRules.list) {
      allowed.list = allowed.read
      if (recordChecks.includes('read')) recordChecks.push('list')
      continue
    }
    const rule = ruleFor(source, model, operation, options)
    const decision = typeof rule === 'boolean' ? rule : await decide(rule, { ...ctx, model, operation })
    if (decision === 'record') {
      allowed[operation] = true
      recordChecks.push(operation)
    } else if (typeof decision === 'boolean') {
      allowed[operation] = decision
    } else {
      allowed[operation] = true
      filters[operation] = decision
    }
  }

  const fieldRules = source.fieldAccess()
  const fieldContext = (operation: AccessAction) => ({ ...ctx, model, operation })
  const names = Object.keys(model.fields)
  const readableFields: string[] = []
  const writable = { create: [] as string[], update: [] as string[] }
  for (const name of names) {
    const rules = fieldRules[name]
    const field = model.fields[name]!
    if (allowed.list || allowed.read) {
      if (await verdict(rules?.read, fieldContext('read'), true, `The read rule of field "${name}"`)) readableFields.push(name)
    }
    for (const operation of ['create', 'update'] as const) {
      if (!allowed[operation] || field.readOnly) continue
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
  const rule = ruleFor(source, model, operation, options)
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
