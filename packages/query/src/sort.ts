import type { FieldModel, ResourceModel, SortSpec } from '@protobase/schema'
import { primaryKeyFields, requireField } from './columns'
import { QueryError } from './errors'

export type Direction = 'asc' | 'desc'
export type SortKey = { field: FieldModel; direction: Direction }

export const flip = (direction: Direction): Direction => (direction === 'asc' ? 'desc' : 'asc')

const checkDirection = (direction: unknown): Direction => {
  if (direction === 'asc' || direction === 'desc') return direction
  throw new QueryError('invalid_sort', 'Sort direction must be "asc" or "desc"')
}

/**
 * The requested sort with the primary key appended as final tie-breaker, so ordering is total.
 * The tie-breaker follows the first sort direction, which keeps uniform sorts eligible for row-value seeks.
 * Nullable columns sort NULLS LAST for asc and NULLS FIRST for desc (see order.ts and seek.ts).
 */
export const effectiveSort = (model: ResourceModel, sort: SortSpec = []): SortKey[] => {
  const keys: SortKey[] = []
  for (const [name, direction] of sort) {
    const field = requireField(model, name, 'sortable')
    if (keys.some(key => key.field === field)) continue
    keys.push({ field, direction: checkDirection(direction) })
  }
  const tieBreaker = keys[0]?.direction ?? 'asc'
  for (const field of primaryKeyFields(model)) {
    if (!keys.some(key => key.field === field)) keys.push({ field, direction: tieBreaker })
  }
  return keys
}

export const sortSignature = (keys: SortKey[]) => keys.map(key => `${key.field.name}:${key.direction}`)
