import type { Styled, TableProps } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { EmbeddedDisplaySwitch, EmbeddedList } from '../../embedded-list/embedded-list'
import { useEmbeddedDisplay } from '../../embedded-list/use-embedded-display'
import { useAdminMeta } from '../../meta-gate'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

type LoadedProps = Omit<TableProps, 'resource' | 'actions'> & { model: ResourceModel; view: ViewModel | undefined; actions: BlockProps['slots'][string]; className?: string }

const LoadedTable = ({ model, view, filter = '', sort = '', columns, button, limit = 10, display: preferred, title, description, empty, actions, className }: LoadedProps) => {
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
      className={cn('h-full', className)}
    >
      <EmbeddedList model={model} view={view} filter={filter} sort={sort} columns={columns} button={button} limit={limit} display={display} empty={empty} />
    </CardFrame>
  )
}

/** The first `limit` records in `sort` order, in the list page's table, with its row button, or display, with a link to the whole list. */
export const TableBlock = ({ node, slots, className }: BlockProps) => {
  const { className: _className, ...props } = propsOf<TableProps & Styled>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[props.resource]
  if (!model) return null
  return <LoadedTable {...props} model={model} view={views[model.name]} actions={slots.actions} className={className} />
}
