import type { ResourceModel, ViewModel } from '@protobase/schema'
import { renderCell } from '../../data-grid/cells'
import type { ColumnSpec } from '../../data-grid/column-spec'
import type { FieldWidget } from './field-widget'
import { shownWidget } from './shown-widget'
import { WidgetPart } from './widget-part'

/**
 * The list's columns, where the view shows a field with a field type drawn by the field type's cell (else its
 * display), with the built-in cell as its fallback.
 */
export const withFieldTypeCells = (columns: ColumnSpec[], model: ResourceModel, view: ViewModel | undefined, fieldTypes: Readonly<Record<string, FieldWidget>> | undefined): ColumnSpec[] =>
  columns.map((spec) => {
    const field = model.fields[spec.id]
    const shown = field && shownWidget(fieldTypes, field, view?.fields[spec.id])
    if (!shown) return spec
    return {
      ...spec,
      render: (row) => <WidgetPart shown={shown} part="cell" field={field} value={row[spec.id]} fallback={renderCell(spec, spec.value ? spec.value(row) : row[spec.id])} />,
    }
  })
