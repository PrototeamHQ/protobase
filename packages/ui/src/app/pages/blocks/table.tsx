import type { TableProps } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { EmbeddedDisplaySwitch, EmbeddedList } from '../../embedded-list/embedded-list'
import { useEmbeddedDisplay } from '../../embedded-list/use-embedded-display'
import { useAdminMeta } from '../../meta-gate'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

type LoadedProps = Omit<TableProps, 'resource' | 'actions'> & { model: ResourceModel; view: ViewModel | undefined; actions: BlockProps['slots'][string] }

const LoadedTable = ({ model, view, filter = '', sort = '', columns, limit = 10, display: preferred, title, description, empty, actions }: LoadedProps) => {
  const [display, pick] = useEmbeddedDisplay(view, `page:${model.name}:${title ?? ''}:${filter}`, preferred)
  return (
    <CardFrame
      title={title}
      description={description}
      actions={
        <>
          <EmbeddedDisplaySwitch view={view} value={display} onChange={pick} />
          {actions}
        </>
      }
      className="h-full"
    >
      <EmbeddedList model={model} view={view} filter={filter} sort={sort} columns={columns} limit={limit} display={display} empty={empty} />
    </CardFrame>
  )
}

/** The first `limit` records in `sort` order, in the list page's table or display, with a link to the whole list. */
export const TableBlock = ({ node, slots }: BlockProps) => {
  const props = propsOf<TableProps>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[props.resource]
  if (!model) return null
  return <LoadedTable {...props} model={model} view={views[model.name]} actions={slots.actions} />
}
