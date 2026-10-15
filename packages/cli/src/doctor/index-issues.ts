import { uncoveredColumns, type IndexNeed, type TableIndexes, type UncoveredColumn } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import type { Issue } from './check'
import type { ReadShape } from './read-shape'

// The reads that need one index: each request once, with every place in the config it comes from.
type Refusal = { column: UncoveredColumn; requests: Map<string, string[]> }

const kinds: Record<IndexNeed, string> = { btree: 'index', trigram: 'pg_trgm index', digits: 'pg_trgm index', gin: 'GIN index' }

const served = (column: UncoveredColumn) => (column.need === 'digits' ? `the digits of "${column.column}"` : `the column "${column.column}"`)

/**
 * The reads of `model` that the scan guard refuses with the table's indexes, by the scan guard's own rule: one error per
 * index to add, naming each read that needs it and where it comes from.
 */
export const indexIssues = (model: ResourceModel, table: TableIndexes, shapes: ReadShape[]): Issue[] => {
  const refusals = new Map<string, Refusal>()
  for (const shape of shapes) {
    if (shape.resource !== model.name) continue
    for (const column of uncoveredColumns(model, table, shape.query, shape.scope)) {
      const refusal = refusals.get(column.suggestion) ?? { column, requests: new Map() }
      const from = refusal.requests.get(shape.request) ?? []
      if (!from.includes(shape.from)) refusal.requests.set(shape.request, [...from, shape.from])
      refusals.set(column.suggestion, refusal)
    }
  }
  return [...refusals.values()].map(({ column, requests }) => ({
    severity: 'error',
    resource: model.name,
    message: `no ${kinds[column.need]} serves ${served(column)}, so the API refuses:${[...requests].map(([request, from]) => `\n            ${request} (${from.join('; ')})`).join('')}`,
    suggestion: `${column.suggestion};`,
  }))
}
