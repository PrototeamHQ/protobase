import { bucketsCommentPrefix, retiredSchema } from '@protobase/server/internal'
import type { Catalog, CatalogColumn, CatalogLimit, CatalogRelation, CatalogTrigger } from './catalog'

// What a migration takes from the code still running while it deploys, and from the version before once rolled back:
// what that code reads, writes or relies on that is gone or changed after it, or a new limit the rows it writes may
// break. A table, column or sequence dropped and made again counts too, as its rows or values are lost; a view, a
// function, a trigger or a generated column made again does not. Privileges taken back are left alone: narrowing
// access is always allowed.

const kindNames: Record<string, string> = { r: 'table', p: 'table', f: 'foreign table', v: 'view', m: 'materialized view', S: 'sequence' }

// The relations whose rows are lost when they are made again.
const holdsRows = new Set(['r', 'p', 'S'])
const tables = new Set(['r', 'p'])

// A time rollup's table, as its comment says Protobase made it: its rows are recomputed from its source, so one made
// again loses none, and only its own function writes it.
const recomputed = (relation: CatalogRelation) => relation.comment?.startsWith(bucketsCommentPrefix) ?? false

// The insert, delete, update and truncate bits of `pg_trigger.tgtype`.
const eventBits = [
  [4, 'insert'],
  [8, 'delete'],
  [16, 'update'],
  [32, 'truncate'],
] as const

// The functions of the watch on retired columns, whose triggers only count what older code writes, for no code to read.
const watchesRetired = (fn: string) => fn.startsWith(`${retiredSchema}.`)

// The events the enabled triggers calling each function fire on, by function, the watch's left out.
const firedEvents = (triggers: readonly CatalogTrigger[]) => {
  const events = new Map<string, number>()
  for (const trigger of triggers.filter(({ enabled, function: fn }) => enabled !== 'D' && !watchesRetired(fn))) events.set(trigger.function, (events.get(trigger.function) ?? 0) | (trigger.type & 60))
  return events
}

const lostTriggers = (relation: CatalogRelation, before: readonly CatalogTrigger[], after: readonly CatalogTrigger[]) => {
  const now = firedEvents(after)
  return [...firedEvents(before)].flatMap(([fn, had]) => {
    const lost = eventBits.filter(([bit]) => had & bit && !((now.get(fn) ?? 0) & bit)).map(([, event]) => event)
    return lost.length > 0 ? [`drops or disables the trigger calling ${fn} on ${relation.name} for ${lost.join(', ')}`] : []
  })
}

const byRelation = <T extends { relation: string }>(items: T[], oid: string) => items.filter((item) => item.relation === oid)

// `keepsValues`: whether a column added again loses its values, as a table's does unless its rows are recomputed.
const columnChanges = (relation: CatalogRelation, before: CatalogColumn[], after: CatalogColumn[], keepsValues = tables.has(relation.kind)) =>
  before.flatMap((had) => {
    const now = after.find((column) => column.name === had.name)
    const name = `${relation.name}.${had.name}`
    if (!now) return [`drops or renames column ${name}`]
    if (keepsValues && !had.generated && now.number !== had.number) return [`drops column ${name} and adds it again, losing its values`]
    if (now.type !== had.type) return [`changes the type of column ${name} from ${had.type} to ${now.type}`]
    if (now.notNull && !had.notNull) return [`makes column ${name} not null`]
    if (now.notNull && had.hasDefault && !now.hasDefault && !now.generated) return [`removes the default of the required column ${name}`]
    return []
  })

const requiredColumns = (relation: CatalogRelation, before: CatalogColumn[], after: CatalogColumn[]) =>
  after
    .filter((column) => !before.some((had) => had.name === column.name) && column.notNull && !column.hasDefault && !column.generated)
    .map((column) => `adds the required column ${relation.name}.${column.name} without a default`)

const newLimits = (relation: CatalogRelation, what: string, before: CatalogLimit[], after: CatalogLimit[]) =>
  after
    .filter((limit) => !before.some((had) => had.name === limit.name && had.definition === limit.definition))
    .map((limit) => `adds the ${what} ${limit.name} to ${relation.name}, which rows written by older code may break`)

const relationChanges = (before: Catalog, after: Catalog, relation: CatalogRelation, dropped: ReadonlySet<string>) => {
  const now = after.relations.find((found) => found.name === relation.name)
  const kind = kindNames[relation.kind]!
  if (!now && dropped.has(relation.oid)) return []
  if (!now) return [`drops, renames or moves ${kind} ${relation.name}`]
  if (now.kind !== relation.kind) return [`makes ${kind} ${relation.name} a ${kindNames[now.kind]!}`]
  const columns = [byRelation(before.columns, relation.oid), byRelation(after.columns, now.oid)] as const
  // A time rollup's table made again is replaced: older code loses only the columns it reads, and writes none of it.
  if (now.oid !== relation.oid && recomputed(relation) && recomputed(now)) return columnChanges(relation, ...columns, false)
  if (holdsRows.has(relation.kind) && now.oid !== relation.oid) return [`drops ${kind} ${relation.name} and makes it again, losing its rows`]
  if (!tables.has(relation.kind)) return columnChanges(relation, ...columns)
  // A constraint's own unique index is named after it, so it is named once.
  const constraints = [byRelation(before.constraints, relation.oid), byRelation(after.constraints, now.oid)] as const
  const indexes = [byRelation(before.uniqueIndexes, relation.oid), byRelation(after.uniqueIndexes, now.oid)].map((found) => found.filter((index) => !constraints[1].some((constraint) => constraint.name === index.name))) as [CatalogLimit[], CatalogLimit[]]
  return [
    ...columnChanges(relation, ...columns),
    ...requiredColumns(relation, ...columns),
    ...newLimits(relation, 'constraint', ...constraints),
    ...newLimits(relation, 'unique index', ...indexes),
    ...lostTriggers(relation, byRelation(before.triggers, relation.oid), byRelation(after.triggers, now.oid)),
  ]
}

const functionChanges = (before: Catalog, after: Catalog) =>
  before.functions.flatMap((had) => {
    const now = after.functions.find((fn) => fn.key === had.key)
    if (!now) return [`drops, renames or moves function ${had.key}, or changes its arguments`]
    return now.result === had.result ? [] : [`changes what function ${had.key} returns from ${had.result} to ${now.result}`]
  })

const enumChanges = (before: Catalog, after: Catalog) =>
  before.enums.flatMap((had) => {
    const now = after.enums.find((found) => found.name === had.name)
    if (!now) return [`drops, renames or moves type ${had.name}`]
    return had.labels.filter((label) => !now.labels.includes(label)).map((label) => `removes the value ${label} of type ${had.name}`)
  })

/**
 * What the change from `before` to `after` takes from older code, one line each; none when it only adds. `dropped`: the
 * oids of the tables a step of the auth store drops, which no older code reads (`Step.drops`), whose drop takes nothing.
 */
export const contractions = (before: Catalog, after: Catalog, dropped: ReadonlySet<string> = new Set()) => [
  ...before.relations.flatMap((relation) => relationChanges(before, after, relation, dropped)),
  ...functionChanges(before, after),
  ...enumChanges(before, after),
]
