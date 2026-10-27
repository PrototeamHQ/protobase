import type { ResourceModel, ViewModel } from './model'

/** The fields a view's list shows as columns: its list columns, else the resource's first six fields the caller reads. */
export const listColumnNames = (resource: ResourceModel, view: ViewModel | undefined) =>
  view?.list?.columns ?? Object.values(resource.fields).filter((field) => !field.writeOnly).slice(0, 6).map((field) => field.name)
