import type { ResourcePermissions } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { CellEditor } from '../../data-grid'
import { isEditable } from '../../live/field-values'
import { can, rowAllows } from '../permissions'
import { CellFieldEditor } from './cell-field-editor'
import { useListEdits } from './use-list-edits'

/**
 * The list's cells edited in place: the view's `editable` columns, which `/meta` keeps to the fields the caller may
 * write, of the rows the caller may change. `patches` are the values saved since the rows loaded, for the grid to show.
 */
export const useListCellEditor = (model: ResourceModel, view: ViewModel | undefined, permissions: ResourcePermissions) => {
  const edits = useListEdits(model)
  const columns = view?.list?.editable ?? []
  const offered = columns.length > 0 && can(permissions, 'update')
  const editor: CellEditor | undefined = offered
    ? {
        editable: (row, column) => columns.includes(column) && model.fields[column] !== undefined && isEditable(model.fields[column]) && rowAllows(row, 'update'),
        render: (row, column, close) => (
          <CellFieldEditor field={model.fields[column]!} hints={view?.fields[column]} resource={model.name} stored={row[column]} onSave={(value) => void edits.save(row, column, value)} close={close} />
        ),
      }
    : undefined
  return { editor, patches: edits.patches }
}
