import { cellText } from './cell-text'
import type { ColumnKind, ColumnSpec, GridRow } from './column-spec'

// Widths are estimated from character counts rather than measured, so they are the same everywhere and need no fonts loaded

/** Room for a header at 12px plus cell padding, the sort arrow and the column menu button. */
export const headerWidth = (header: string, sortable: boolean) => Math.ceil(header.length * 7.2) + 24 + (sortable ? 16 : 0) + 28

/** A status badge: dot, padding and the longest label. */
export const badgeWidth = (labels: string[]) => Math.ceil(Math.max(0, ...labels.map((label) => label.length)) * 7.2) + 56

/** Pixels per character: body text, the small monospace of identifiers, and tabular numbers. */
const charWidth = { body: 7.5, mono: 7.2, numeric: 8 }

const cellPadding = 24

// Room for the avatar of a user or the icon of a file before its name
const iconRoom = 24

// A ticked boolean shows only its check mark
const checkWidth = 16

/** Values cut short would read wrong, so their columns take their measured width whole. */
const wholeKinds = new Set<ColumnKind>(['status', 'money', 'number', 'signed', 'percent', 'date', 'datetime', 'boolean'])

const numericKinds = new Set<ColumnKind>(['money', 'number', 'signed', 'percent', 'date', 'datetime'])

const minWeight = 80
const maxWeight = 400
const maxIdWidth = 240

const perChar = (kind: ColumnKind) => (kind === 'id' ? charWidth.mono : numericKinds.has(kind) ? charWidth.numeric : charWidth.body)

const valueOf = (spec: ColumnSpec, row: GridRow) => (spec.value ? spec.value(row) : row[spec.id])

/** The width the widest of `rows`' values of `spec` takes, cell padding included. */
export const contentWidth = (spec: ColumnSpec, rows: GridRow[]) => {
  const texts = rows.map((row) => cellText(spec, valueOf(spec, row)))
  if (spec.kind === 'status') return badgeWidth(texts.map((text) => text ?? ''))
  const icon = spec.kind === 'user' || spec.kind === 'file' ? iconRoom : 0
  const widest = Math.max(0, ...texts.map((text) => (text === undefined ? checkWidth : Math.ceil(text.length * perChar(spec.kind)))))
  return widest + icon + cellPadding
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const fitted = (spec: ColumnSpec, content: number): ColumnSpec => {
  if (wholeKinds.has(spec.kind) && !spec.title) return { ...spec, fixed: true, width: Math.max(spec.minWidth ?? 0, content) }
  const weighted = { ...spec, fixed: false, width: clamp(content, minWeight, maxWeight) }
  if (spec.kind !== 'id') return weighted
  // Short codes show whole, long ones up to a point, and the header keeps its room
  return { ...weighted, minWidth: Math.max(headerWidth(spec.header, spec.sortable ?? false), Math.min(content, maxIdWidth)) }
}

/**
 * Columns sized by the values in `rows`: values that must stay whole get their widest value's width, text a share of the
 * leftover space as large as its widest value, and the title column the largest share. Columns drawn by their own
 * `render` keep their width, as their content cannot be estimated.
 */
export const fitColumns = (specs: ColumnSpec[], rows: GridRow[]): ColumnSpec[] => {
  if (rows.length === 0) return specs
  const sized = specs.map((spec) => (spec.render ? spec : fitted(spec, contentWidth(spec, rows))))
  const shares = sized.filter((spec, index) => !spec.fixed && !spec.title && !specs[index]!.render).map((spec) => spec.width)
  const largest = Math.max(0, ...shares)
  return sized.map((spec, index) => (spec.title && !specs[index]!.render ? { ...spec, width: Math.max(spec.width, largest) } : spec))
}
