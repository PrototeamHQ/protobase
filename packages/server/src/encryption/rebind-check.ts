import { parseTable } from '@protobase/schema/internal'
import type { Entry } from '../registry'
import type { RebindOption } from './apply'

// The table and column the values were sealed under, as the database names them: the field's own where `from` names none.
const sources = (entry: Entry, rebind: RebindOption) => {
  const table = rebind.from.table === undefined ? entry.model.table : parseTable(rebind.from.table)
  return Object.values(entry.model.fields)
    .filter((field) => field.encrypted && (rebind.field === undefined || field.name === rebind.field))
    .map((field) => ({ table, column: rebind.from.column ?? field.column }))
}

const sameTable = (a: { schema?: string; name: string }, b: { schema?: string; name: string }) =>
  a.name === b.name && (a.schema === undefined || b.schema === undefined || a.schema === b.schema)

/**
 * Why `rebind` cannot run, or `undefined`: it must name a resource with encrypted fields, an encrypted field of it, and
 * where they were before; and no resource may still encrypt a field over that place, whose values it would take over.
 */
export const rebindProblem = (entries: readonly Entry[], rebind: RebindOption) => {
  const entry = entries.find((candidate) => candidate.name === rebind.resource)
  if (!entry) return `There is no resource "${rebind.resource}"`
  if (rebind.field !== undefined && !entry.model.fields[rebind.field]?.encrypted) return `${rebind.resource}.${rebind.field} is not an encrypted field`
  if (!Object.values(entry.model.fields).some((field) => field.encrypted)) return `${rebind.resource} has no encrypted fields`
  if (rebind.from.table === undefined && rebind.from.column === undefined) return 'Name the table or the column the values were in before'
  if (rebind.from.column !== undefined && rebind.field === undefined) return 'Name the field whose column was renamed'
  for (const { table, column } of sources(entry, rebind)) {
    const owner = entries.find((other) => sameTable(other.model.table, table) && Object.values(other.model.fields).some((field) => field.encrypted && field.column === column))
    if (owner) return `${owner.name} still encrypts a field over ${table.schema ? `${table.schema}.` : ''}${table.name}.${column}, so its values are not ${rebind.resource}'s to take over`
  }
  return undefined
}
