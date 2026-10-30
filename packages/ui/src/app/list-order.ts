import type { ResourceModel, ViewModel } from '@protobase/schema'

export type Sort = { columnId: string; direction: 'asc' | 'desc' }

/**
 * The order a list opens in: the view's sort, else the primary key's when it is sortable. Otherwise none, as the API
 * refuses a sort by a field that is not sortable and orders a list without one by its key anyway.
 */
export const defaultOrderBy = (model: ResourceModel, view: ViewModel | undefined) => {
  const sort = view?.list?.sort?.[0]
  if (sort) return `${sort[0]} ${sort[1]}`
  const key = model.primaryKey[0]!
  return model.fields[key]?.sortable ? `${key} asc` : ''
}

export const parseSort = (orderBy: string): Sort => {
  const [columnId = '', direction] = orderBy.trim().split(/\s+/)
  return { columnId, direction: direction === 'desc' ? 'desc' : 'asc' }
}

export const sortToOrderBy = (sort: Sort) => `${sort.columnId} ${sort.direction}`
