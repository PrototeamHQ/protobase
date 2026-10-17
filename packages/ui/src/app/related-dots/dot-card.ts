import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { RelatedColumnLoad } from '../../live/related-column-rows'
import { displaysOf, shownFields } from '../displays/list-displays'

type CardsDisplayModel = Extract<ListDisplayModel, { kind: 'cards' }>

/**
 * The card a dot shows of its record: the first cards display of the record's view, without the photos, favorite
 * button and dots a small card has no room for, else the record's title with its status as the badge.
 */
export const dotCard = (view: ViewModel | undefined, status: string): CardsDisplayModel => {
  const cards = displaysOf(view).find((display): display is CardsDisplayModel => display.kind === 'cards')
  if (!cards) return { kind: 'cards', name: 'dot', badge: status }
  const { photos: _, favorite: __, dots: ___, ...card } = cards
  return card
}

/** What the list loads for the related columns of its view among `columns`: each with the fields its dots' cards show. */
export const relatedColumnLoads = (view: ViewModel | undefined, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, columns: string[]): RelatedColumnLoad[] =>
  (view?.list?.relatedColumns ?? [])
    .filter((column) => columns.includes(column.name))
    .flatMap((column) => {
      const target = resources[column.resource]
      return target ? [{ column, fields: shownFields(target, views[target.name], dotCard(views[target.name], column.status)) }] : []
    })
