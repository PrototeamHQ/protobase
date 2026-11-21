import { lookupQueries, tableIndexes, uncoveredColumns, type CoverageQuery, type Db, type Scope, type TableIndexes, type UncoveredColumn } from '@protobase/query'
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
    case 'related':
      return `Reading "${column.field}" for related()`
    case 'sort':
      return `Sorting by "${column.field}"`
    case 'facet':
      return `Counting the values of "${column.field}"`
    case 'per':
      return `Keeping the first rows per value of "${column.field}"`
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

  // The parents a read keeps to are read by their own scope, their columns judged against their own table's indexes; a
  // `related()` term's resource is read as the caller sees it, with its subfilter and sort as a list of it is, for the key
  // it selects. A JSON list of keys needs no index: it is only read from the rows the indexed subfilter and sort chose,
  // never filtered or sorted on, and a btree index on a whole list caps its size (json has no btree class at all).
  const parentColumns = async (scope: Scope): Promise<UncoveredColumn[]> => {
    const columns = await Promise.all((scope.parents ?? []).map(async ({ parent, related }) => {
      if (!parent) return []
      const { model, key, scope: own } = parent
      const sort = related?.page?.sort
      const query = related ? { ...(related.filter && { filter: related.filter }), ...(sort && { sort }), ...(!parent.items && { selects: key }) } : {}
      return [
        ...uncoveredColumns(related?.model ?? model, await indexesOfModel(model), query, own).map((column) => ({ ...column, field: `${model.name}.${column.field}` })),
        ...(await parentColumns(own)),
      ]
    }))
    return columns.flat()
  }

  // A lookup field's linked records are read by their own scope too, by the linked field a term, sort or grouping names,
  // judged against the linked table's indexes; its link on this table is judged with the read's other columns.
  const lookupColumns = async (model: ResourceModel, query: CoverageQuery): Promise<UncoveredColumn[]> => {
    const columns = await Promise.all(lookupQueries(model, query).map(async ({ read, query: linked }) => [
      ...uncoveredColumns(read.model, await indexesOfModel(read.model), linked, read.scope).map((column) => ({ ...column, field: `${read.model.name}.${column.field}` })),
      ...(await parentColumns(read.scope)),
    ]))
    return columns.flat()
  }

  /** Throws a 400 problem for a column no index serves in `reject` mode; in `warn` mode returns the warning text. */
  const check = async (entry: Entry, query: CoverageQuery, context: GuardContext) => {
    if (mode === 'off') return undefined
    const columns = [...uncoveredColumns(context.model, await indexesOf(entry), query, context.scope), ...(await parentColumns(context.scope)), ...(await lookupColumns(context.model, query))]
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
