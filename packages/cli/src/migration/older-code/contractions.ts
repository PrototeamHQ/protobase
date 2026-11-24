import type { Catalog, CatalogColumn, CatalogLimit, CatalogRelation } from './catalog'

// What a migration takes from the code still running while it deploys, and from the version before once rolled back:
// what that code reads, writes or relies on that is gone or changed after it, or a new limit the rows it writes may
// break. A table, column or sequence dropped and made again counts too, as its rows or values are lost; a view, a
// function, a trigger or a generated column made again does not. Privileges taken back are left alone: narrowing
// access is always allowed.

const kindNames: Record<string, string> = { r: 'table', p: 'table', f: 'foreign table', v: 'view', m: 'materialized view', S: 'sequence' }

// The relations whose rows are lost when they are made again.
const holdsRows = new Set(['r', 'p', 'S'])
const tables = new Set(['r', 'p'])

const byRelation = <T extends { relation: string }>(items: T[], oid: string) => items.filter((item) => item.relation === oid)

const columnChanges = (relation: CatalogRelation, before: CatalogColumn[], after: CatalogColumn[]) =>
  before.flatMap((had) => {
    const now = after.find((column) => column.name === had.name)
    const name = `${relation.name}.${had.name}`
    if (!now) return [`drops or renames column ${name}`]
    if (tables.has(relation.kind) && !had.generated && now.number !== had.number) return [`drops column ${name} and adds it again, losing its values`]
    if (now.type !== had.type) return [`changes the type of column ${name} from ${had.type} to ${now.type}`]
    if (now.notNull && !had.notNull) return [`makes column ${name} not null`]
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

const relationChanges = (before: Catalog, after: Catalog, relation: CatalogRelation) => {
  const now = after.relations.find((found) => found.name === relation.name)
  const kind = kindNames[relation.kind]!
  if (!now) return [`drops, renames or moves ${kind} ${relation.name}`]
  if (now.kind !== relation.kind) return [`makes ${kind} ${relation.name} a ${kindNames[now.kind]!}`]
  if (holdsRows.has(relation.kind) && now.oid !== relation.oid) return [`drops ${kind} ${relation.name} and makes it again, losing its rows`]
  const columns = [byRelation(before.columns, relation.oid), byRelation(after.columns, now.oid)] as const
  if (!tables.has(relation.kind)) return columnChanges(relation, ...columns)
  // A constraint's own unique index is named after it, so it is named once.
  const constraints = [byRelation(before.constraints, relation.oid), byRelation(after.constraints, now.oid)] as const
  const indexes = [byRelation(before.uniqueIndexes, relation.oid), byRelation(after.uniqueIndexes, now.oid)].map((found) => found.filter((index) => !constraints[1].some((constraint) => constraint.name === index.name))) as [CatalogLimit[], CatalogLimit[]]
  const triggers = byRelation(after.triggers, now.oid)
  const lostTriggers = [...new Set(byRelation(before.triggers, relation.oid).map((trigger) => trigger.function))].filter((fn) => !triggers.some((trigger) => trigger.function === fn))
  return [
    ...columnChanges(relation, ...columns),
    ...requiredColumns(relation, ...columns),
    ...newLimits(relation, 'constraint', ...constraints),
    ...newLimits(relation, 'unique index', ...indexes),
    ...lostTriggers.map((fn) => `drops the trigger calling ${fn} on ${relation.name}`),
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

/** What the change from `before` to `after` takes from older code, one line each; none when it only adds. */
export const contractions = (before: Catalog, after: Catalog) => [
  ...before.relations.flatMap((relation) => relationChanges(before, after, relation)),
  ...functionChanges(before, after),
  ...enumChanges(before, after),
]
