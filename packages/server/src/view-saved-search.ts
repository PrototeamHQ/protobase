import type { ResourceModel, SaveSearchModel, SearchesOfModel, ViewModel } from '@protobase/schema'

const writable = (model: ResourceModel, role: string, name: string | undefined) =>
  name === undefined || !model.fields[name]?.readOnly ? [] : [`${role} "${name}" is read-only, so a search cannot be saved or changed`]

/**
 * What is wrong with a view's `searchesOf` on `resource`, against the app's models: the searched resource is there and
 * its `unseen.field` a filterable timestamp or date, the searches are each user's own, and the fields a save or a control
 * writes are writable.
 */
export const searchesOfErrors = (searches: SearchesOfModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const own = models[resource]
  const target = models[searches.resource]
  if (!own || !target) return [`unknown resource "${own ? searches.resource : resource}"`]
  const seen = searches.unseen && Object.hasOwn(target.fields, searches.unseen.field) ? target.fields[searches.unseen.field]! : undefined
  return [
    ...(own.owner === undefined ? [`${resource} has no owner, so its searches are not each user's own`] : []),
    ...writable(own, 'filter', searches.filter),
    ...writable(own, 'name', searches.name),
    ...writable(own, 'unseen.seenAt', searches.unseen?.seenAt),
    ...(searches.controls ?? []).flatMap((name) => writable(own, 'control', name)),
    ...(searches.unseen && !seen ? [`unseen.field: unknown field "${searches.unseen.field}" on ${target.name}`] : []),
    ...(seen && !(seen.filterable && (seen.type === 'timestamp' || seen.type === 'date')) ? [`unseen.field "${seen.name}" on ${target.name} is not a filterable timestamp or date`] : []),
  ]
}

/** What is wrong with a list page's "Save search" button on `resource`: a view of the searches' resource lists searches of it. */
export const saveSearchErrors = (search: SaveSearchModel, resource: string, models: Record<string, ResourceModel>, views: readonly ViewModel[]): string[] => {
  if (!models[search.resource]) return [`unknown resource "${search.resource}"`]
  const listing = views.some((view) => view.resource === search.resource && view.searchesOf?.resource === resource)
  return listing ? [] : [`no view of ${search.resource} has searchesOf("${resource}"), so a saved search would be listed nowhere`]
}

/**
 * The view's `searchesOf` as one caller may use it, against their models: gone when they cannot list the searched
 * resource or read the filter, the name and the controls narrowed to those they can write, and `unseen` kept while they
 * can write `seenAt` and filter by `field`.
 */
export const searchesOfFor = (searches: SearchesOfModel, resource: string, models: Record<string, ResourceModel>): SearchesOfModel | undefined => {
  const own = models[resource]
  const target = models[searches.resource]
  if (!own || !target || !Object.hasOwn(own.fields, searches.filter)) return undefined
  const canWrite = (name: string) => Object.hasOwn(own.fields, name) && !own.fields[name]!.readOnly
  const { name, controls, unseen, ...rest } = searches
  const kept = controls?.filter(canWrite)
  const seenKept = unseen && canWrite(unseen.seenAt) && target.fields[unseen.field]?.filterable ? unseen : undefined
  return { ...rest, ...(name !== undefined && canWrite(name) && { name }), ...(kept && kept.length > 0 && { controls: kept }), ...(seenKept && { unseen: seenKept }) }
}
