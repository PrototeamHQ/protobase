import type { ViewModel } from '@protobase/schema'
import type { ResourceNames } from './mail-sender-use-check'

/** What each resource's records are called, as its view names them; the resource's name where no view does. */
export const viewNames = (views: readonly ViewModel[]): ResourceNames => (resource) => {
  const names = views.find((view) => view.resource === resource)?.names
  return names ?? { singular: resource, plural: resource }
}
