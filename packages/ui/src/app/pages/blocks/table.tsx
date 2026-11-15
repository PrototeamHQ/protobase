import { useMemo, type ReactNode } from 'react'
import { columnName, type Styled, type TableProps } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { EmbeddedDisplaySwitch, EmbeddedList } from '../../embedded-list/embedded-list'
import { useEmbeddedDisplay } from '../../embedded-list/use-embedded-display'
import { useAdminMeta } from '../../meta-gate'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'
import { ListTable } from './list-table'
import { CardFrame } from './card-frame'
import { phoneSpecs } from './table-phone-columns'
import { GuardedParams } from '../../guarded-params'
import { ChosenRecord } from './chosen-record'
import { usePageParams } from '../page-params'
import type { RouteTarget } from '../../../primitives/route-link'
import { tableDisplay } from '@protobase/schema/internal'
import type { PlannedList } from '../../embedded-list/planned-embedded-rows'
import { usePlannedReads } from '../plan-reads'

type LoadedProps = Omit<TableProps, 'resource' | 'actions' | 'children' | 'select'> & {
  model: ResourceModel
  view: ViewModel | undefined
  actions: BlockProps['slots'][string]
  className?: string
  /** With `select`: where a row leads, the chosen row's key, and its children under the table. */
  chosen?: { rowTo: (key: string) => RouteTarget; key: string | undefined; details: ReactNode }
  /** Its rows and total from the page's planned reads, inside the records of another block. */
  planned?: PlannedList
}

const LoadedTable = ({ model, view, filter = '', sort = '', columns, button, bulk, limit = 10, display: picked, title, description, empty, actions, className, chosen, planned }: LoadedProps) => {
  const [shown, pick] = useEmbeddedDisplay(view, `page:${model.name}:${title ?? ''}:${filter}`, picked)
  // A row is chosen in the table, so a table with `select` shows no other display
  const display = chosen ? tableDisplay : shown
  const names = useMemo(() => columns?.map(columnName), [columns])
  const phoneColumns = useMemo(() => phoneSpecs(columns), [columns])
  return (
    <CardFrame
      title={title}
      description={description}
      actions={
        <>
          {!chosen && <EmbeddedDisplaySwitch view={view} value={display} onChange={pick} />}
          {actions}
        </>
      }
      className={cn('h-full', className)}
    >
      <EmbeddedList model={model} view={view} filter={filter} sort={sort} columns={names} button={button} bulk={bulk} limit={limit} display={display} empty={empty} phoneColumns={phoneColumns} {...(chosen && { rowTo: chosen.rowTo, chosenKey: chosen.key })} {...(planned && { planned })} />
      {chosen?.details}
    </CardFrame>
  )
}

/**
 * The first `limit` records in `sort` order, in the list page's table, with its row button and, with `bulk`, the view's
 * bulk actions for the rows selected, or display, with a link to the whole list. A phone shows the columns `phoneSpecs`
 * picks. Without `resource`, the records of the list around it. With `select`, a row leads to the page with it chosen,
 * and the chosen row's children follow the table. Inside the records of another block, its rows and total per record
 * come from the page's planned reads.
 */
export const TableBlock = ({ node, at, slots, children, className }: BlockProps) => {
  const { className: _className, resource, select, children: _children, ...props } = propsOf<TableProps & Styled>(node)
  const { resources, views } = useAdminMeta()
  const [rows, total] = usePlannedReads([at, at === undefined ? undefined : `${at}#total`])
  const planned = useMemo(() => rows && { rows, total }, [rows, total])
  if (resource === undefined) return <ListTable {...props} actions={slots.actions} className={className} />
  const model = resources[resource]
  if (!model) return null
  if (select !== undefined) {
    return (
      <SelectTable {...props} model={model} view={views[model.name]} actions={slots.actions} className={className} select={select} {...(planned && { planned })}>
        {children}
      </SelectTable>
    )
  }
  return <LoadedTable {...props} model={model} view={views[model.name]} actions={slots.actions} className={className} {...(planned && { planned })} />
}

/** A table whose rows each link to the page with that row's key in the parameter `select`, and the chosen row's children under it. */
const SelectTable = ({ select, children, ...props }: Omit<LoadedProps, 'chosen'> & { select: string; children: ReactNode[] }) => {
  const { given, linkTo } = usePageParams()
  const rowTo = (key: string) => linkTo({ [select]: key })
  const key = given[select]
  // A form under the chosen row asks before another row replaces it
  const details = key === undefined ? null : <GuardedParams name={select}><ChosenRecord key={key} model={props.model} query={{ key }}>{children}</ChosenRecord></GuardedParams>
  return <LoadedTable {...props} chosen={{ rowTo, key, details }} />
}
