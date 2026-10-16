import type { RelatedLabels } from '@protobase/client'
import { csvText, xlsxCell, type ExportColumn, type ExportMode } from './cells'
import { csvField, csvLine, csvTextField, utf8Bom } from './csv'
import { createXlsxWriter } from './xlsx'

export type ExportFormat = 'xlsx' | 'csv'

/** What a file is built from, everything plain data so it can be posted to a worker. */
export type ExportPlan = {
  format: ExportFormat
  mode: ExportMode
  /** The resource's label, which names the sheet. */
  name: string
  columns: ExportColumn[]
}

export type ExportRecord = Record<string, unknown>

// Fields whose CSV text is free text someone typed, which a spreadsheet could take for a formula.
const typedText = new Set(['text', 'uuid', 'enum', 'relation', 'file', 'json', 'currency', 'country'])

const minWidth = 8
const maxWidth = 60

/** Each column's width in characters, room for its header and the longest value of the first page as shown. */
export const columnWidths = (columns: ExportColumn[], records: ExportRecord[], labels: RelatedLabels) =>
  columns.map((column) => {
    const longest = Math.max(column.header.length, ...records.map((record) => csvText(column, record[column.name], labels, 'shown').length))
    return Math.min(maxWidth, Math.max(minWidth, longest + 2))
  })

const createCsvBuilder = (plan: ExportPlan, onChunk: (chunk: Uint8Array) => void) => {
  const encoder = new TextEncoder()
  onChunk(utf8Bom)
  onChunk(encoder.encode(csvLine(plan.columns.map((column) => csvField(column.header)))))
  const field = (column: ExportColumn, record: ExportRecord, labels: RelatedLabels) => {
    const text = csvText(column, record[column.name], labels, plan.mode)
    return typedText.has(column.field.type) ? csvTextField(text) : csvField(text)
  }
  return {
    page: (records: ExportRecord[], labels: RelatedLabels) => {
      onChunk(encoder.encode(records.map((record) => csvLine(plan.columns.map((column) => field(column, record, labels)))).join('')))
    },
    finish: () => undefined,
  }
}

// The columns' widths come from the first page, so the sheet starts with it.
const createXlsxBuilder = (plan: ExportPlan, onChunk: (chunk: Uint8Array) => void) => {
  let writer: ReturnType<typeof createXlsxWriter> | undefined
  const start = (records: ExportRecord[], labels: RelatedLabels) =>
    createXlsxWriter({ name: plan.name, headers: plan.columns.map((column) => column.header), widths: columnWidths(plan.columns, records, labels) }, onChunk)
  return {
    page: (records: ExportRecord[], labels: RelatedLabels) => {
      writer ??= start(records, labels)
      writer.rows(records.map((record) => plan.columns.map((column) => xlsxCell(column, record[column.name], labels, plan.mode))))
    },
    finish: () => {
      writer ??= start([], {})
      writer.finish()
    },
  }
}

/**
 * Builds an export file page by page: `page` with each page of records and the names of the records their relations
 * point at, then `finish` once. Each piece of the file goes to `onChunk` as soon as it is made.
 */
export const createExportBuilder = (plan: ExportPlan, onChunk: (chunk: Uint8Array) => void) =>
  plan.format === 'csv' ? createCsvBuilder(plan, onChunk) : createXlsxBuilder(plan, onChunk)
