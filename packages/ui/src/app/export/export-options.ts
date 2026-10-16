import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { columnsFromModel, listColumnNames } from '../../live/columns-from-model'
import type { ExportFormat } from './builder'
import type { ExportColumn, ExportMode } from './cells'
import { exportPageSize } from './run-export'
import { xlsxMaxRows } from './xlsx'

const where = createWhere()

/** Which rows a file holds: those the list finds with its filters, search and sort, or the selected ones. */
export type ExportScope = 'list' | 'selected'

/** What the Export dialog asks for. */
export type ExportSettings = { format: ExportFormat; scope: ExportScope; columns: string[]; mode: ExportMode }

/** Whether the view's list offers Export: unless the view takes it away. */
export const exportOffered = (view: ViewModel | undefined) => view?.export !== false

/**
 * The fields a file may hold, in the resource's order: those the user may read, which `/meta` gives, but the sensitive
 * ones, which no list carries and the page shows only when revealed one at a time.
 */
export const exportableFields = (model: ResourceModel) => Object.values(model.fields).flatMap((field) => (field.sensitive ? [] : [field.name]))

/** The columns a file starts with: the list's own, in its order. */
export const defaultExportColumns = (model: ResourceModel, view: ViewModel | undefined) => {
  const exportable = new Set(exportableFields(model))
  return listColumnNames(model, view).filter((name) => exportable.has(name))
}

/** Each field's header, as the list's column for it reads. */
export const exportHeaders = (model: ResourceModel, view: ViewModel | undefined, names: string[]) =>
  Object.fromEntries(columnsFromModel(model, view, [], names).map((column) => [column.id, column.header]))

/** The columns of a file, each with its field, header and the view's hints for showing it. */
export const exportColumns = (model: ResourceModel, view: ViewModel | undefined, names: string[]): ExportColumn[] => {
  const headers = exportHeaders(model, view, names)
  return names.flatMap((name) => {
    const field = model.fields[name]
    return field ? [{ name, header: headers[name]!, field, hints: view?.fields[name] ?? {} }] : []
  })
}

/** The most rows a file of `format` holds: the view's limit, and for a workbook what one sheet can hold. */
export const exportLimit = (view: ViewModel | undefined, format: ExportFormat) => {
  const viewLimit = view?.export ? (view.export.maxRows ?? Infinity) : Infinity
  return Math.min(viewLimit, format === 'xlsx' ? xlsxMaxRows : Infinity)
}

/** Whether selected rows can be exported: they are found again by their key, which must be a single field. */
export const exportsSelection = (model: ResourceModel) => model.primaryKey.length === 1

/** Filters that find the selected records again by key, a page's worth in each. */
export const selectionFilters = (model: ResourceModel, keys: Array<string | number>) => {
  const [keyField] = model.primaryKey
  if (!keyField || model.primaryKey.length !== 1) throw new Error('Not implemented: selected rows are exported by a single-field key')
  const filters: string[] = []
  for (let start = 0; start < keys.length; start += exportPageSize) filters.push(printFilter(where.in(keyField, keys.slice(start, start + exportPageSize))))
  return filters
}
