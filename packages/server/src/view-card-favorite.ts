import type { CardFavoriteModel, ResourceModel } from '@protobase/schema'
import { matchErrors } from './view-related'

/**
 * What is wrong with the favorite button of a cards display on `resource`, against these models; empty when the cards
 * can save to it. Against the full models it checks the config; against a caller's models, whether that caller can
 * list the saved records and write the field that points at the card.
 */
export const cardFavoriteErrors = (favorite: CardFavoriteModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = models[resource]
  const target = models[favorite.resource]
  if (!owner || !target) return [`unknown resource "${owner ? favorite.resource : resource}"`]
  if (owner.primaryKey.length !== 1) return [`${resource} has a composite key, so its cards cannot be saved`]
  const match = matchErrors(target, favorite.field, resource)
  if (match.length > 0) return match
  return target.fields[favorite.field]!.readOnly ? [`"${favorite.field}" on ${target.name} is read-only, so a press cannot save the card`] : []
}

/** What is wrong with the favorite button's resource itself: it has an owner, so each user lists and saves their own. */
export const favoriteOwnerErrors = (favorite: CardFavoriteModel, models: Record<string, ResourceModel>): string[] => {
  const target = models[favorite.resource]
  return target && target.owner === undefined ? [`${target.name} has no owner, so its records are not each user's own`] : []
}
