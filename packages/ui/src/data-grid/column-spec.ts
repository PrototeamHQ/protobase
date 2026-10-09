import type { BadgeTone } from '../primitives/badge'

export type ColumnKind =
  | 'text' | 'id' | 'money' | 'date' | 'datetime' | 'status' | 'relation'
  | 'boolean' | 'number' | 'signed' | 'percent' | 'user'

export type GridRow = { id: string } & Record<string, unknown>

export type ColumnSpec = {
  id: string
  header: string
  kind: ColumnKind
  /** Relative width in px; columns grow proportionally to fill the grid. */
  width: number
  /** Pixels the column never shrinks below, for values that must stay whole such as identifiers. */
  minWidth?: number
  /** A fixed pixel width instead of a share of the leftover space, for values of known length such as timestamps. */
  fixed?: boolean
  sortable?: boolean
  /** Tints the column to mark it as new. */
  highlight?: boolean
  currency?: string
  /** Badge tone per value, for `status` columns. */
  tones?: Record<string, BadgeTone>
  /** Badge text per value, for `status` columns; a value without one reads as itself in words. */
  labels?: Record<string, string>
  /** Reads the cell value; defaults to `row[id]`. */
  value?: (row: GridRow) => unknown
}

export const isRightAligned = (kind: ColumnKind) => kind === 'money' || kind === 'number' || kind === 'signed' || kind === 'percent'
