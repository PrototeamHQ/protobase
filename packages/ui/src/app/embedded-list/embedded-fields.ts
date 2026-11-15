import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { rowButtonFields } from '@protobase/schema/internal'
import type { ColumnSpec } from '../../data-grid'
import { listColumnNames } from '../../live/columns-from-model'
import { loadedFields } from '../displays/list-displays'
import type { FieldWidget } from '../field-types/field-widget'
import { embeddedColumns } from './embedded-columns'
import { embeddedReadFields } from './embedded-read-fields'

export type EmbeddedFieldsInput = {
  model: ResourceModel
  view: ViewModel | undefined
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  fieldTypes: Readonly<Record<string, FieldWidget>> | undefined
  /** The table's columns; the list's columns by default. */
  columns?: string[]
  button?: RowButtonModel
  opens?: string
  bulk: boolean
  /** Picks the columns a phone shows, when `xs`. */
  phoneColumns?: (specs: ColumnSpec[]) => ColumnSpec[]
  /** Whether the screen is a phone's. */
  xs: boolean
}

/**
 * An embedded list's columns on this screen, the fields its relations are labelled for (`fields`) and those each row
 * is read with (`read`), as `useEmbeddedRows` takes them, so a page can start the same read before the list draws.
 */
export const embeddedFields = ({ model, view, resources, views, fieldTypes, columns, button, opens, bulk, phoneColumns, xs }: EmbeddedFieldsInput) => {
  const all = embeddedColumns(model, view, columns ?? listColumnNames(model, view), { resources, views, fieldTypes })
  const specs = xs && phoneColumns ? phoneColumns(all) : all
  const fields = loadedFields(model, view, [...specs.map((spec) => spec.id), ...(button ? rowButtonFields(button) : [])])
  return { specs, fields, read: embeddedReadFields(model, view, { shown: fields, opens, bulk }) }
}
