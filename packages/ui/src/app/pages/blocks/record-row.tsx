import type { RecordRowProps } from '@protobase/layout'
import { useAdminMeta } from '../../meta-gate'
import { RecordRowBody } from '../../record-row/record-row-body'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

/** What a filter finds: its chips, the count, its records as a sideways row of their list's cards, and "View all". */
export const RecordRowBlock = ({ node, slots }: BlockProps) => {
  const { resource, filter = '', sort, limit, display, title, description, empty } = propsOf<RecordRowProps>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[resource]
  if (!model) return null
  return (
    <CardFrame title={title} description={description} actions={slots.actions}>
      <RecordRowBody model={model} view={views[model.name]} filter={filter} sort={sort} limit={limit} display={display} empty={empty} />
    </CardFrame>
  )
}
