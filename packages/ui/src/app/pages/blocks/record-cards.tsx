import { cardsLayoutOf, type CardWidth, type RecordCardsProps } from '@protobase/layout'
import { listColumnNames } from '../../../live/columns-from-model'
import { SectionContent } from '../../../record-view/section'
import { useAdminMeta } from '../../meta-gate'
import { RelatedCards } from '../../related-cards/related-cards'
import { propsOf, type BlockProps } from './block-props'

const shares: Record<CardWidth, number> = { '1/4': 1 / 4, '1/3': 1 / 3, '1/2': 1 / 2, '2/3': 2 / 3 }

/**
 * What a filter finds as the record page's related cards, stacked full width or in a row that scrolls sideways, under
 * a heading like a record page section's, with no card frame around them, so no card sits in another.
 */
export const RecordCardsBlock = ({ node, slots }: BlockProps) => {
  const props = propsOf<RecordCardsProps>(node)
  const { resource, filter = '', sort = '', fields, cardActions = [], limit = 10, display, title, description, empty } = props
  const { layout, cardWidth } = cardsLayoutOf(props)
  const { resources, views } = useAdminMeta()
  const model = resources[resource]
  if (!model) return null
  const view = views[model.name]
  return (
    <section className="min-w-0" aria-label={title}>
      <SectionContent title={title} help={description} actions={slots.actions}>
        <RelatedCards model={model} view={view} filter={filter} sort={sort} fields={fields ?? listColumnNames(model, view)} actions={cardActions} limit={limit} display={display} empty={empty} carousel={layout === 'carousel' ? shares[cardWidth] : undefined} />
      </SectionContent>
    </section>
  )
}
