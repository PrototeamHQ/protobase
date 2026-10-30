import type { AppAddress, ResourceModel, ViewModel } from '@protobase/schema'
import type { GridRow, RowAction } from '../../data-grid'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import type { RouteTarget } from '../../primitives/route-link'
import { rowAllows } from '../permissions'
import { relationTarget } from '../related-opens'
import { text } from './messages'

type Targets = {
  model: ResourceModel
  view: ViewModel | undefined
  /** The relation whose record a row opens instead of its own. */
  opens: string | undefined
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Whether the user may update the rows' own records. */
  canUpdate: boolean
}

const singularOf = (model: ResourceModel, view: ViewModel | undefined) => (view?.names?.singular ?? humanize(model.name)).toLowerCase()

/**
 * Where a table row of an embedded list leads, and its menu's items. A row opens its own record, or with `opens` the
 * record that relation points at when it holds one; its menu then opens that record and edits, or for a user who may
 * not, opens the row's own.
 */
export const embeddedRowTargets = ({ model, view, opens, resources, views, canUpdate }: Targets) => {
  const own = (row: GridRow): AppAddress => ({ kind: 'record', resource: model.name, key: recordKey(model, row) })
  const farName = opens && model.fields[opens]?.relation?.resource
  const far = farName ? resources[farName] : undefined
  const other = (row: GridRow): AppAddress | undefined => {
    const key = opens && far ? relationTarget(row, opens) : undefined
    return far && key !== undefined ? { kind: 'record', resource: far.name, key } : undefined
  }
  const address = (row: GridRow) => other(row) ?? own(row)
  const singular = singularOf(model, view)

  const actions = (linkTo: (to: AppAddress) => RouteTarget): RowAction[] => {
    const openOwn: RowAction = { label: text('open', { singular }), link: (row) => linkTo(own(row)) }
    if (!far) return [openOwn]
    const editable = (row: GridRow) => canUpdate && rowAllows(row, 'update')
    return [
      { label: text('open', { singular: singularOf(far, views[far.name]) }), available: (row) => other(row) !== undefined, link: (row) => linkTo(other(row)!) },
      { label: text('edit', { singular }), available: editable, link: (row) => linkTo({ kind: 'record', resource: model.name, key: recordKey(model, row), edit: true }) },
      { ...openOwn, available: (row) => !editable(row) },
    ]
  }
  return { address, actions }
}
