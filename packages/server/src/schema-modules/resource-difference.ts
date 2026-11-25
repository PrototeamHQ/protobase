import { createHash } from 'node:crypto'
import type { ModuleNames, ResourceEntry, ResourceInput, ResourceReplaceable, TableName } from './schema-module'

/** A digest of a resource's statements, which the model holds so a change to them is written again. */
export const statementsDigest = (sql: string) => createHash('sha256').update(sql).digest('hex').slice(0, 16)

// What one resource's objects are written by: their statements, and what they leave for after the transaction.
const statementsOf = (replaceable: ResourceReplaceable, names: ModuleNames, input: unknown) => {
  const after = replaceable.after?.(names, input)
  return after === undefined ? replaceable.sql(names, input) : `${replaceable.sql(names, input)}\n${after}`
}

/** The entry `replaceable` writes for one resource's `given` input under `names`. */
export const resourceEntry = (replaceable: ResourceReplaceable, names: ModuleNames, given: ResourceInput): ResourceEntry => ({
  version: replaceable.version,
  digest: statementsDigest(statementsOf(replaceable, names, given.input)),
  table: given.table,
  ...(given.column !== undefined && { column: given.column }),
})

const sameTable = (a: TableName, b: TableName) => a.name === b.name && a.schema === b.schema

// Whether two entries are on the same table and column.
const samePlace = (a: Pick<ResourceEntry, 'table' | 'column'>, b: Pick<ResourceEntry, 'table' | 'column'>) => sameTable(a.table, b.table) && a.column === b.column

const sameEntry = (a: ResourceEntry, b: ResourceEntry) => a.version === b.version && a.digest === b.digest && samePlace(a, b)

/** The resources of `given` that need the replaceable's objects, not only keep them. */
export const wantedResources = (given: Record<string, ResourceInput>) => Object.entries(given).filter(([, input]) => !input.kept)

/**
 * What brings one resource replaceable from the entries the database has, `had`, to what `given` asks: the removals,
 * of objects at a place no resource needs them any more and of those a resource's statements replace (`replace`), each
 * under the title naming its resource; each resource's statements; what they leave for after the transaction
 * (`after`); the entries the database has once they are applied; and what of them the code before does not run on. A
 * resource no longer in `given`, or only kept, keeps its objects while another still needs them (`keptWhileOthers`),
 * following its input when it has one, and loses them once none does, which takes them from older code still running;
 * a replaceable without `drop` leaves them, and keeps their entry, so a resource that needs them again finds them. A
 * table a resource needs takes only that resource's objects.
 */
export const resourceDifference = (replaceable: ResourceReplaceable, names: ModuleNames, given: Record<string, ResourceInput>, had: Record<string, ResourceEntry>) => {
  const keeping = replaceable.keptWhileOthers && wantedResources(given).length > 0
  const drops: string[] = []
  const writes: string[] = []
  const after: string[] = []
  const breaks: string[] = []
  const entries: Record<string, ResourceEntry> = {}
  const dropped = (key: string, before: ResourceEntry, why: string, broken: string) => {
    if (!replaceable.drop) return
    drops.push(`-- ${replaceable.title} of ${key}${why}.\n${replaceable.drop(names, before.table, before.column, key).trim()}`)
    breaks.push(broken)
  }
  const write = (key: string, input: ResourceInput) => {
    const entry = resourceEntry(replaceable, names, input)
    entries[key] = entry
    const before = had[key]
    if (before && sameEntry(before, entry)) return
    // Its objects on the place it had go with the other drops, before any write, which may make them there.
    if (before && !samePlace(before, entry)) dropped(key, before, ' on the table it had', `it drops its ${replaceable.name} of ${key} on the table it had, which the code before still runs with`)
    if (before && samePlace(before, entry) && replaceable.replace) drops.push(`-- ${replaceable.title} of ${key}, made again.\n${replaceable.replace(names, before.table, before.column).trim()}`)
    writes.push(`-- ${replaceable.title} of ${key}.\n${replaceable.sql(names, input.input).trim()}`)
    const rebuilt = replaceable.after?.(names, input.input)
    if (rebuilt !== undefined) after.push(`-- ${replaceable.title} of ${key}.\n${rebuilt.trim()}`)
    if (before && before.version < replaceable.compatibleFrom) {
      breaks.push(`it replaces its ${replaceable.name} of ${key} at version ${before.version} with version ${replaceable.version}, which the code before does not run on`)
    }
  }
  // A table a resource needs the objects on is its alone: the objects kept for another resource there were replaced
  // by its own, so that resource is no longer recorded, and is written again once it needs them.
  const wanted = wantedResources(given)
  const claimed = (key: string, table: TableName) => wanted.some(([other, input]) => other !== key && sameTable(input.table, table))
  for (const [key, input] of Object.entries(given)) {
    if (!input.kept || (keeping && had[key] && !claimed(key, input.table))) write(key, input)
  }
  for (const [key, before] of Object.entries(had)) {
    if (entries[key]) continue
    if (keeping) {
      if (!claimed(key, before.table)) entries[key] = before
      continue
    }
    if (!replaceable.drop) {
      entries[key] = before
      continue
    }
    dropped(key, before, ', which no resource needs any more', `it drops its ${replaceable.name} of ${key}, which the code before still runs with`)
  }
  return { drops, writes, after, entries, breaks }
}
