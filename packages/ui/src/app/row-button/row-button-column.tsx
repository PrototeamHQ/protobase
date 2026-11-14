import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import type { ColumnSpec, GridRow } from '../../data-grid'
import { cellPadding } from '../../data-grid/content-widths'
import { displayRow } from '../displays/list-displays'
import { RowButtonLink } from './row-button-link'
import { rowButtonFor } from './row-button-for'

// Widths are estimated from character counts, as the grid's other columns are: a small button's medium-weight label
// per character, its padding and border, and the outside-link mark with its gap
const labelCharWidth = 8
const buttonFrame = 22
const outsideMark = 20

/** The widest a row's button grows before its label shortens, on a wide screen and on a narrow one. */
export const rowButtonMaxWidth = { wide: 288, narrow: 192 }

const recordOf = (model: ResourceModel, row: GridRow) => displayRow(model, row).record

const rowButton = (model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel) => (row: GridRow) => (
  <RowButtonLink button={button} model={model} view={view} record={recordOf(model, row)} />
)

/** The pixels a row's button cell needs to show its label whole; none for a row without a button. */
const rowButtonWidth = (model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel) => (row: GridRow) => {
  const shown = rowButtonFor(button, model, view, recordOf(model, row))
  if (!shown) return 0
  return Math.ceil(shown.label.length * labelCharWidth) + buttonFrame + ('href' in shown ? outsideMark : 0) + cellPadding
}

/**
 * A table's last column, with the row's button in each row, as wide as its longest label up to `maxWidth`, past which
 * a label shortens and shows whole on hover; its header is empty, as the buttons say what they do.
 */
export const rowButtonColumn = (model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel, maxWidth: number): ColumnSpec => ({
  id: '_row_button',
  header: '',
  kind: 'text',
  // Until rows load: room for a short label with the outside-link mark, such as "Error report"
  width: 152,
  minWidth: 96,
  maxWidth,
  sortable: false,
  render: rowButton(model, view, button),
  fit: rowButtonWidth(model, view, button),
})

/**
 * A table's columns with the row's button: its last column, or on a narrow screen, where the table scrolls sideways
 * and a last column starts off-screen, under the first cell's text when there is one.
 */
export const withRowButton = (specs: ColumnSpec[], model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel, narrow: boolean): ColumnSpec[] => {
  if (!narrow) return [...specs, rowButtonColumn(model, view, button, rowButtonMaxWidth.wide)]
  const [first, ...rest] = specs
  // Without a first cell to sit under, the button keeps its own column
  if (!first) return [rowButtonColumn(model, view, button, rowButtonMaxWidth.narrow)]
  return [{ ...first, below: rowButton(model, view, button) }, ...rest]
}
