import type { CheckedFilter, FieldModel, ResourceModel, SortSpec } from '@protobase/schema'
import { uncoveredColumns, type CoverageQuery, type UncoveredColumn } from './index-coverage'
import { lookupReadOf, type LookupRead } from './lookup-read'
import type { TableIndexes } from './table-indexes'

/** A read of a lookup field's linked records, judged against their table's indexes in the caller's scope on them. */
export type LookupCoverage = { field: string; read: LookupRead; query: CoverageQuery }

type Term = Extract<CheckedFilter, { field: FieldModel }>

const lookupTerms = (node: CheckedFilter | undefined): Term[] => {
  if (!node) return []
  if (node.kind === 'and' || node.kind === 'or') return node.args.flatMap(lookupTerms)
  if (node.kind === 'not') return lookupTerms(node.arg)
  return 'field' in node && node.field.lookup ? [node] : []
}

/**
 * What a read of the resource reads of its lookup fields' linked records: each term on a lookup field filters them by
 * the linked field, and a sort, grouping or first rows per value of one walks them by it. Empty is read as a linked
 * value that is not empty, negated, as the filter compiles it.
 */
export const lookupQueries = (model: ResourceModel, query: CoverageQuery): LookupCoverage[] => {
  const walked = (name: string | undefined, walk: (value: string) => CoverageQuery): LookupCoverage[] => {
    const field = name === undefined ? undefined : model.fields[name]
    const read = field && lookupReadOf(field)
    return field && read ? [{ field: field.name, read, query: walk(read.value.name) }] : []
  }
  const sort = query.sort?.[0]
  return [
    ...lookupTerms(query.filter).map((term) => {
      const read = lookupReadOf(term.field)!
      const linked: CheckedFilter = { ...term, field: read.value }
      const filter: CheckedFilter = term.kind === 'isNull' ? { kind: 'not', arg: linked, span: term.span } : linked
      return { field: term.field.name, read, query: { filter } }
    }),
    ...walked(sort?.[0], (value): CoverageQuery => ({ sort: [[value, sort![1]]] satisfies SortSpec })),
    ...walked(query.groupBy, (value) => ({ groupBy: value })),
    // The rows per value are found by the value, which is no order the API sorts by
    ...walked(query.per, (value) => ({ groupBy: value })),
  ]
}

/**
 * Whether an index of the linked table serves finding each record's linked record, by the linked record's key or its
 * relation that points at the record: every read that shows the lookup field does that once per record.
 */
export const uncoveredLookupMatch = (read: LookupRead, table: TableIndexes): UncoveredColumn[] =>
  uncoveredColumns(read.model, table, { selects: read.match }).map((column) => ({ ...column, use: 'lookup' }))
