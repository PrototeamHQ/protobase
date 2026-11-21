import type { FieldModel } from '@protobase/schema'

export type Direction = 'asc' | 'desc'
export type SortKey = { field: FieldModel; direction: Direction }
