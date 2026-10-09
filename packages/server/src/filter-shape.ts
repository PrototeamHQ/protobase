import type { CheckedFilter, FieldModel } from '@protobase/schema'

/** The filter with its values blanked out: queries that differ only in values share a shape. */
export const filterShape = (filter?: CheckedFilter): string => {
  if (!filter) return ''
  switch (filter.kind) {
    case 'and':
    case 'or':
      return `${filter.kind}(${filter.args.map(filterShape).join(',')})`
    case 'not':
      return `not(${filterShape(filter.arg)})`
    case 'compare':
      return `${filter.field.name}${filter.op}?`
    case 'search':
      return 'search'
    default:
      return `${filter.kind}:${filter.field.name}`
  }
}

export const filterFields = (filter?: CheckedFilter): FieldModel[] => {
  if (!filter) return []
  switch (filter.kind) {
    case 'and':
    case 'or':
      return filter.args.flatMap(filterFields)
    case 'not':
      return filterFields(filter.arg)
    case 'search':
      return []
    default:
      return [filter.field]
  }
}
