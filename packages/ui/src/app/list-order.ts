import type { ResourceModel, ViewModel } from '@protobase/schema'

export type Sort = { columnId: string; direction: 'asc' | 'desc' }

export const defaultOrderBy = (model: ResourceModel, view: ViewModel | undefined) => {
  const sort = view?.list?.sort?.[0]
  return sort ? `${sort[0]} ${sort[1]}` : `${model.primaryKey[0]} asc`
}

export const parseSort = (orderBy: string): Sort => {
  const [columnId = '', direction] = orderBy.trim().split(/\s+/)
  return { columnId, direction: direction === 'desc' ? 'desc' : 'asc' }
}

export const sortToOrderBy = (sort: Sort) => `${sort.columnId} ${sort.direction}`
