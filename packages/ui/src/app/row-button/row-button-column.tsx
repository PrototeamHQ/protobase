import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import type { ColumnSpec, GridRow } from '../../data-grid'
import { displayRow } from '../displays/list-displays'
import { RowButtonLink } from './row-button-link'

const rowButton = (model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel) => (row: GridRow) => (
  <RowButtonLink button={button} model={model} view={view} record={displayRow(model, row).record} />
)

/** A table's last column, with the row's button in each row; its header is empty, as the buttons say what they do. */
export const rowButtonColumn = (model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel): ColumnSpec => ({
  id: '_row_button',
  header: '',
  kind: 'text',
  // Room for a short label with the outside-link mark, such as "Error report"
  width: 152,
  minWidth: 96,
  sortable: false,
  render: rowButton(model, view, button),
})

/**
 * A table's columns with the row's button: its last column, or on a narrow screen, where the table scrolls sideways
 * and a last column starts off-screen, under the first cell's text.
 */
export const withRowButton = (specs: ColumnSpec[], model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel, narrow: boolean): ColumnSpec[] => {
  if (!narrow) return [...specs, rowButtonColumn(model, view, button)]
  const [first, ...rest] = specs
  if (!first) return specs
  return [{ ...first, below: rowButton(model, view, button) }, ...rest]
}
