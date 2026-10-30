import { useMemo } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { DataGrid, type GridRow } from '../../data-grid'
import { recordKey, recordTitle } from '../../live/model-helpers'
import { Skeleton } from '../../primitives/skeleton'
import { embeddedColumns } from '../embedded-list/embedded-columns'
import { loadedFields } from '../displays/list-displays'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { Problem } from '../pages/problem'
import { useProjectUi } from '../pages/project-ui'
import { useAppAddress } from '../use-app-address'
import { useHandOrder } from './use-hand-order'
import { text } from './messages'
import type { Sort } from '../list-order'

type Props = {
  model: ResourceModel
  view: ViewModel | undefined
  /** The integer field the records are sorted by, from `listHandOrder` or `relatedHandOrder`. */
  field: string
  /** The records sorted together: all of them, or those of one parent. */
  filter: string
  /** The table's columns, the list's by default. */
  columns: string[]
  /** The list's order, which the headers change, sorting the records another way; without it the headers do not sort. */
  sort?: { value: Sort; onChange: (sort: Sort) => void }
}

/**
 * The records in their order by hand, in the list's table with a drag handle in each row's checkbox place: dragging a
 * row, or moving it with the keyboard from its handle, renumbers them all, landing where the list's `drag.rule` allows.
 * The page scrolls them, and a row still opens its record.
 */
export const HandSortedList = ({ model, view, field, filter, columns, sort }: Props) => {
  const { resources, views } = useAdminMeta()
  const { fields: fieldTypes, dropRules } = useProjectUi()
  const { go, href } = useAppAddress()
  // The order is the field's, so the headers sort only when they leave it for another
  const sorts = sort !== undefined
  const specs = useMemo(() => embeddedColumns(model, view, columns, { resources, views, fieldTypes }).map((spec) => (sorts ? spec : { ...spec, sortable: false })), [model, view, columns.join(','), resources, views, fieldTypes, sorts])
  const fields = useMemo(() => loadedFields(model, view, specs.map((spec) => spec.id)), [model, view, specs])
  const ruleName = view?.list?.drag?.rule
  const rule = ruleName === undefined ? undefined : dropRules?.[ruleName]
  const order = useHandOrder({ model, view, field, filter, fields, ...(rule && { rule }) })
  const rows = order.rows
  const source = useMemo(() => rows && { total: rows.length, rowAt: (index: number) => rows[index]! }, [rows])

  if (ruleName !== undefined && !rule) return <Problem>{text.rich('noRule', { rule: ruleName })}</Problem>
  if (order.loading) return <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
  if (order.error) return <ErrorBanner title={text('couldNotLoad')} error={order.error} />
  if (!source || source.total === 0) return <p className="text-muted-foreground">{text('nothingYet')}</p>

  const openRecord = (row: GridRow) => go({ kind: 'record', resource: model.name, key: recordKey(model, row) })
  const recordLink = (row: GridRow) => ({ href: href({ kind: 'record', resource: model.name, key: recordKey(model, row) }), onFollow: () => openRecord(row) })
  return (
    <DataGrid
      fit
      scroll="parent"
      columns={specs}
      source={source}
      latencyMs={0}
      onOpenRow={openRecord}
      rowLink={recordLink}
      {...(sort && { sort: sort.value, onSortChange: sort.onChange })}
      rowNumbers={false}
      reorder={{ label: (row) => recordTitle(model, view, row, row.id), onMove: order.move }}
    />
  )
}
