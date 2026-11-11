import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import type { ColumnSpec } from '../../data-grid'
import { displayRow } from '../displays/list-displays'
import { RowButtonLink } from './row-button-link'

/** A table's last column, with the row's button in each row; its header is empty, as the buttons say what they do. */
export const rowButtonColumn = (model: ResourceModel, view: ViewModel | undefined, button: RowButtonModel): ColumnSpec => ({
  id: '_row_button',
  header: '',
  kind: 'text',
  width: 120,
  minWidth: 96,
  sortable: false,
  render: (row) => <RowButtonLink button={button} model={model} view={view} record={displayRow(model, row).record} />,
})
