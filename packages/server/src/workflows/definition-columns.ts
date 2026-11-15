import { sql } from 'kysely'
import { definitionFromParts, type Definition, type DefinitionParts } from '@protobase/workflows'

const columns = ['state_machine', 'trigger', 'execution_order', 'connections', 'trace'] as const

/**
 * The columns a workflow's version keeps its definition in, of the table `alias` names, each selected as
 * `<prefix><column>`, for `definitionOfRow` to read back. `alias` and `prefix` are the query's own words, never input.
 */
export const definitionColumns = (alias: string, prefix = '') => sql.raw(columns.map((column) => `${alias}."${column}" as "${prefix}${column}"`).join(', '))

/** The definition a row's `definitionColumns` hold; undefined where the join found no version. */
export const definitionOfRow = (row: Record<string, unknown>, prefix = ''): Definition | undefined => {
  if (row[`${prefix}state_machine`] === null || row[`${prefix}state_machine`] === undefined) return
  return definitionFromParts(Object.fromEntries(columns.map((column) => [column, row[`${prefix}${column}`]])) as DefinitionParts)
}
