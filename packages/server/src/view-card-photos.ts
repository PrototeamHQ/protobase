import type { CardPhotosModel, ResourceModel } from '@protobase/schema'
import { matchErrors, sortErrors } from './view-related'

/**
 * What is wrong with the photos of a cards display on `resource`, against these models; empty when the cards can show
 * them. Against the full models it checks the config; against a caller's models, whether that caller can load them.
 */
export const cardPhotosErrors = (photos: CardPhotosModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = models[resource]
  const target = models[photos.resource]
  if (!owner || !target) return [`unknown resource "${owner ? photos.resource : resource}"`]
  if (owner.primaryKey.length !== 1) return [`${resource} has a composite key, so its cards cannot match photos`]
  const image = Object.hasOwn(target.fields, photos.image) ? target.fields[photos.image]! : undefined
  return [
    ...matchErrors(target, photos.field, resource),
    ...(!image ? [`unknown field "${photos.image}" on ${target.name}`] : image.type === 'file' ? [] : [`"${photos.image}" on ${target.name} is not a file field`]),
    ...sortErrors(target, photos.sort).map((error) => `sort: ${error}`),
  ]
}
