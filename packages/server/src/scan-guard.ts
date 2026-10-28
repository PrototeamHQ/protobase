import { tableIndexes, uncoveredColumns, type CoverageQuery, type Db, type Scope, type TableIndexes, type UncoveredColumn } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { HttpProblem } from './problem'
import type { Entry } from './registry'
import type { ScanGuardMode } from './types'

/** The model the query runs against (as the caller sees it) and its scope (tenant, row filter, full model). */
export type GuardContext = { model: ResourceModel; scope: Scope }

const reading = (column: UncoveredColumn) => {
  switch (column.use) {
    case 'filter':
      return `Filtering on "${column.field}"`
    case 'access':
      return `The filter your role is limited by, on "${column.field}",`
    case 'parent':
      return `Keeping to the records whose "${column.field}" you may read`
    case 'sort':
      return `Sorting by "${column.field}"`
    case 'facet':
      return `Counting the values of "${column.field}"`
  }
}

const describe = (column: UncoveredColumn) => {
  const kind = column.need === 'btree' ? 'an index' : column.need === 'gin' ? 'a GIN index' : 'a pg_trgm index'
  return `${reading(column)} needs ${kind} that serves the column "${column.column}". Add one, for example: ${column.suggestion}`
}

/**
 * Checks that an index serves every column a read filters, sorts or groups by, from the table's indexes in the catalog
 * (read once per table and kept for the process lifetime), so a read is never refused or allowed by how many rows match.
 */
export const createScanGuard = (db: Db, options: { mode?: ScanGuardMode } = {}) => {
  const { mode = 'reject' } = options
  const tables = new Map<string, TableIndexes>()

  const indexesOfModel = async (model: ResourceModel) => {
    const known = tables.get(model.name)
    if (known) return known
    const read = await tableIndexes(db, model)
    tables.set(model.name, read)
    return read
  }
  const indexesOf = (entry: Entry) => indexesOfModel(entry.model)

  // The parents a read keeps to are read by their own scope, their columns judged against their own table's indexes.
  const parentColumns = async (scope: Scope): Promise<UncoveredColumn[]> => {
    const parents = (scope.parents ?? []).flatMap((read) => (read.parent ? [read.parent] : []))
    const columns = await Promise.all(parents.map(async ({ model, scope: own }) => [
      ...uncoveredColumns(model, await indexesOfModel(model), {}, own).map((column) => ({ ...column, field: `${model.name}.${column.field}` })),
      ...(await parentColumns(own)),
    ]))
    return columns.flat()
  }

  /** Throws a 400 problem for a column no index serves in `reject` mode; in `warn` mode returns the warning text. */
  const check = async (entry: Entry, query: CoverageQuery, context: GuardContext) => {
    if (mode === 'off') return undefined
    const columns = [...uncoveredColumns(context.model, await indexesOf(entry), query, context.scope), ...(await parentColumns(context.scope))]
    const first = columns[0]
    if (!first) return undefined
    const detail = describe(first)
    if (mode === 'warn') return detail
    throw new HttpProblem(400, 'expensive-query', 'Bad Request', detail, { columns, suggestion: first.suggestion })
  }
  // `/api/sb/rest/v1` judges its own filters against the same indexes, in the same mode.
  return Object.assign(check, { mode, indexesOf })
}

export type ScanGuard = ReturnType<typeof createScanGuard>
