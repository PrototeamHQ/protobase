import { useMemo, type ReactNode } from 'react'
import { columnName, type TableProps } from '@protobase/layout'
import type { AppAddress, ResourceModel } from '@protobase/schema'
import { DataGrid } from '../../../data-grid'
import { useIsDesktop, useIsXs } from '../../../lib/use-media-query'
import { listColumnNames } from '../../../live/columns-from-model'
import { recordId } from '../../../live/model-helpers'
import type { RouteTarget } from '../../../primitives/route-link'
import { embeddedColumns } from '../../embedded-list/embedded-columns'
import { embeddedRowTargets } from '../../embedded-list/embedded-row-targets'
import { useAdminMeta, usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import { useProjectUi } from '../project-ui'
import { withRowButton } from '../../row-button/row-button-column'
import { useAppAddress } from '../../use-app-address'
import { useLayoutList } from '../layout-list'
import { CardFrame, Quiet } from './card-frame'
import { phoneSpecs } from './table-phone-columns'
import { text } from '../messages'

type Props = Pick<TableProps, 'columns' | 'button' | 'title' | 'description' | 'empty'> & { model: ResourceModel; items: readonly unknown[]; actions: ReactNode; className?: string }

// The list page's table over records the list around it read, in the list's order: it reads nothing of its own
const LoadedListTable = ({ model, items, columns, button, title, description, empty, actions, className }: Props) => {
  const { resources, views } = useAdminMeta()
  const view = views[model.name]
  const { fields: fieldTypes } = useProjectUi()
  const canUpdate = can(usePermissions(model.name), 'update')
  const { go, href } = useAppAddress()
  const xs = useIsXs()
  const narrow = !useIsDesktop()
  const names = useMemo(() => columns?.map(columnName) ?? listColumnNames(model, view), [columns, model, view])
  const all = useMemo(() => embeddedColumns(model, view, names, { resources, views, fieldTypes }), [model, view, names, resources, views, fieldTypes])
  const specs = useMemo(() => (xs ? phoneSpecs(columns)(all) : all), [xs, columns, all])
  const gridColumns = useMemo(() => (button ? withRowButton(specs, model, view, button, narrow) : specs), [specs, model, view, button, narrow])
  const rows = useMemo(() => items.map((item) => ({ ...(item as Record<string, unknown>), id: recordId(model, item as Record<string, unknown>) })), [items, model])
  const source = useMemo(() => ({ total: rows.length, rowAt: (index: number) => rows[index]! }), [rows])
  const targets = embeddedRowTargets({ model, view, opens: undefined, resources, views, canUpdate })
  const linkTo = (to: AppAddress): RouteTarget => ({ href: href(to), onFollow: () => go(to) })
  return (
    <CardFrame title={title} description={description} actions={actions} className={className}>
      {rows.length === 0 ? (
        <Quiet>{empty ?? text('nothingYet')}</Quiet>
      ) : (
        <DataGrid
          fit
          columns={gridColumns}
          source={source}
          latencyMs={0}
          onOpenRow={(row) => go(targets.address(row))}
          rowLink={(row) => linkTo(targets.address(row))}
          rowActions={targets.actions(linkTo)}
          rowNumbers={false}
          selectable={false}
        />
      )}
    </CardFrame>
  )
}

/** A `Table` without `resource`: the records of the list around it, as react-admin's DataTable draws its ListContext. */
export const ListTable = (props: Omit<Props, 'model' | 'items'>) => {
  const list = useLayoutList()
  if (!list?.model) return null
  return <LoadedListTable {...props} model={list.model} items={list.items} />
}
