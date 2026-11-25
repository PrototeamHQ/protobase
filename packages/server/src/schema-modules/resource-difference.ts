import { createHash } from 'node:crypto'
import type { ModuleNames, ResourceEntry, ResourceInput, ResourceReplaceable, TableName } from './schema-module'

/** A digest of a resource's statements, which the model holds so a change to them is written again. */
export const statementsDigest = (sql: string) => createHash('sha256').update(sql).digest('hex').slice(0, 16)

/** The entry `replaceable` writes for one resource's `given` input under `names`. */
export const resourceEntry = (replaceable: ResourceReplaceable, names: ModuleNames, given: ResourceInput): ResourceEntry => ({
  version: replaceable.version,
  digest: statementsDigest(replaceable.sql(names, given.input)),
  table: given.table,
})

const sameTable = (a: TableName, b: TableName) => a.name === b.name && a.schema === b.schema

const sameEntry = (a: ResourceEntry, b: ResourceEntry) => a.version === b.version && a.digest === b.digest && sameTable(a.table, b.table)

/** The resources of `given` that need the replaceable's objects, not only keep them. */
export const wantedResources = (given: Record<string, ResourceInput>) => Object.entries(given).filter(([, input]) => !input.kept)

/**
 * What brings one resource replaceable from the entries the database has, `had`, to what `given` asks: each resource's
 * statements under the title naming it, drops first, those of a resource moved to another table included; the entries the database has once they are applied; and what of
 * them the code before does not run on. A resource no longer in `given`, or only kept, keeps its objects while another
 * still needs them (`keptWhileOthers`), following its input when it has one, and loses them once none does, which
 * takes them from older code still running.
 */
export const resourceDifference = (replaceable: ResourceReplaceable, names: ModuleNames, given: Record<string, ResourceInput>, had: Record<string, ResourceEntry>) => {
  const keeping = replaceable.keptWhileOthers && wantedResources(given).length > 0
  const drops: string[] = []
  const writes: string[] = []
  const breaks: string[] = []
  const entries: Record<string, ResourceEntry> = {}
  const write = (key: string, input: ResourceInput) => {
    const entry = resourceEntry(replaceable, names, input)
    entries[key] = entry
    const before = had[key]
    if (before && sameEntry(before, entry)) return
    // Its objects on the table it had go with the other drops, before any write, which may make them on that table.
    if (before && !sameTable(before.table, entry.table)) {
      drops.push(`-- ${replaceable.title} of ${key} on the table it had.\n${replaceable.drop(names, before.table).trim()}`)
      breaks.push(`it drops its ${replaceable.name} of ${key} on the table it had, which the code before still runs with`)
    }
    writes.push(`-- ${replaceable.title} of ${key}.\n${replaceable.sql(names, input.input).trim()}`)
    if (before && before.version < replaceable.compatibleFrom) {
      breaks.push(`it replaces its ${replaceable.name} of ${key} at version ${before.version} with version ${replaceable.version}, which the code before does not run on`)
    }
  }
  for (const [key, input] of Object.entries(given)) {
    if (!input.kept || (keeping && had[key])) write(key, input)
  }
  for (const [key, before] of Object.entries(had)) {
    if (entries[key]) continue
    if (keeping) {
      entries[key] = before
      continue
    }
    drops.push(`-- ${replaceable.title} of ${key}, which no resource needs any more.\n${replaceable.drop(names, before.table).trim()}`)
    breaks.push(`it drops its ${replaceable.name} of ${key}, which the code before still runs with`)
  }
  return { parts: [...drops, ...writes], entries, breaks }
}
