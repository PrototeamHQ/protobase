import type { CheckedFilter, FieldModel, ResourceModel, SortSpec } from '@protobase/schema'
import type { CoverageQuery } from './index-coverage'
import { lookupReadOf, type LookupRead } from './lookup-read'

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
 * the linked field, and a sort, grouping or first rows per value of one walks them by it.
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
      return { field: term.field.name, read, query: { filter: { ...term, field: read.value } } }
    }),
    ...walked(sort?.[0], (value): CoverageQuery => ({ sort: [[value, sort![1]]] satisfies SortSpec })),
    ...walked(query.groupBy, (value) => ({ groupBy: value })),
    ...walked(query.per, (value): CoverageQuery => ({ sort: [[value, 'asc']] })),
  ]
}
