import { resolveFieldPath } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { ColumnSpec, GridRow } from '../../data-grid'
import { columnsFromModel } from '../../live/columns-from-model'
import { humanize } from '../../live/naming'
import { displayRow } from '../displays/list-displays'
import type { FieldWidget } from '../field-types/field-widget'
import { withFieldTypeCells } from '../field-types/field-type-cells'
import { withRelationTitleCells } from '../titles/relation-title-cells'
import { FieldValue } from '../pages/field-value'
import { scopeOf } from '../pages/use-layout-data'
import { usePathValue } from '../pages/use-path-value'

const isPath = (column: string) => column.includes('.')

/** A value through relations (`unit_id.property_id`), fetched like the record page fetches it and cached. */
const PathCell = ({ model, row, column }: { model: ResourceModel; row: GridRow; column: string }) => {
  const value = usePathValue(scopeOf(model, displayRow(model, row).record), column)
  if (value.state === 'loading') return <span className="text-muted-foreground">…</span>
  if (value.state === 'missing') return <span className="text-muted-foreground">—</span>
  return <FieldValue model={value.model} field={value.field} value={value.value} />
}

type Meta = { resources: Record<string, ResourceModel>; views: Record<string, ViewModel>; fieldTypes: Readonly<Record<string, FieldWidget>> | undefined }

/** A column through relations, headed by the label of the field it ends at. */
const pathColumn = (model: ResourceModel, column: string, { resources, views }: Meta): ColumnSpec => {
  const resolved = resolveFieldPath(resources, model.name, column)
  const last = resolved.ok ? resolved.steps.at(-1)! : undefined
  const name = last?.field.name ?? column
  return { id: column, header: views[last?.model.name ?? model.name]?.fields[name]?.label ?? humanize(name), kind: 'text', width: 200, render: (row) => <PathCell model={model} row={row} column={column} /> }
}

/** The list page's columns for `names`: fields of `model` as its table draws them, and paths through relations. */
export const embeddedColumns = (model: ResourceModel, view: ViewModel | undefined, names: string[], meta: Meta): ColumnSpec[] => {
  const fields = new Map(withRelationTitleCells(withFieldTypeCells(columnsFromModel(model, view, [], names.filter((name) => !isPath(name))), model, view, meta.fieldTypes), model, meta.resources, meta.views).map((spec) => [spec.id, spec]))
  return names.flatMap((name) => (isPath(name) ? [pathColumn(model, name, meta)] : (fields.get(name) ?? [])))
}
