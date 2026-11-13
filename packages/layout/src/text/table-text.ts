import { columnsByPriority, type ColumnTraits, type TableColumn } from '../table-columns'
import { escapeMarkdown, valueText } from './markdown'

/** A column of a table's text form: its field, its header, the labels of its enum values, and what its priority derives from. */
export type TableTextColumn = ColumnTraits & { name: string; label: string; valueLabels?: Record<string, string> }

/** What a table shows, for its text form: its columns in the table's order, and its records. */
export type TableText = { columns: TableTextColumn[]; rows: Record<string, unknown>[] }

// A list of plain values reads as its items; anything else that holds objects reads as JSON on one line
const holdsObjects = (value: unknown) => typeof value === 'object' && value !== null && !(Array.isArray(value) && value.every((item) => typeof item !== 'object' || item === null))

// A cell is one line, its pipes escaped so they do not end it
const cell = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')

const cellText = (value: unknown, valueLabels: Record<string, string> | undefined) => cell(holdsObjects(value) ? escapeMarkdown(JSON.stringify(value)) : valueText(value, valueLabels))

const row = (cells: string[]) => `| ${cells.join(' | ')} |`

/**
 * A table as a Markdown table: a header row, a separator row and a row per record, its columns most important first by
 * `columnsByPriority`, with the priorities `given` names. Empty without columns.
 */
export const tableMarkdown = ({ columns, rows }: TableText, given: TableColumn[] = []): string => {
  if (columns.length === 0) return ''
  const byName = new Map(columns.map((column) => [column.name, column]))
  const priorities = new Map(given.flatMap((column) => (typeof column === 'string' ? [] : [[column.name, column.priority] as const])))
  const ordered = columnsByPriority(
    columns.map(({ name }) => (priorities.has(name) ? { name, priority: priorities.get(name)! } : name)),
    (name) => byName.get(name)!,
  ).map((name) => byName.get(name)!)
  return [
    row(ordered.map((column) => cell(escapeMarkdown(column.label)))),
    row(ordered.map(() => '---')),
    ...rows.map((record) => row(ordered.map((column) => cellText(record[column.name], column.valueLabels)))),
  ].join('\n')
}
