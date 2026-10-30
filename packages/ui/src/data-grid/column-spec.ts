import type { ReactNode } from 'react'
import type { BadgeTone } from '../primitives/badge'
import type { ContactFormat } from '../live/contact-links'

export type ColumnKind =
  | 'text' | 'id' | 'money' | 'date' | 'datetime' | 'status' | 'relation'
  | 'boolean' | 'number' | 'signed' | 'percent' | 'user' | 'file'

/** A person a `user` column shows for an id. */
export type CellUser = { name: string; initials: string; hue: number }

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
  /** The record's title column: it gets the largest share of the width and is pinned by default. */
  title?: boolean
  /** Tints the column to mark it as new. */
  highlight?: boolean
  /** For a `datetime` column: shows how long ago each value is, its exact time on hover. */
  relative?: boolean
  /** The ISO 4217 code of a `money` column's currency, which it needs. */
  currency?: string
  /** Decimals a `money` column shows instead of the currency's usual ones. */
  decimals?: number
  /** Text before a number, such as a currency sign, for `number` and `signed` columns. */
  prefix?: string
  /** Text after a number, such as a unit, for `number`, `signed` and `money` columns. */
  suffix?: string
  /** Badge tone per value, for `status` columns. */
  tones?: Record<string, BadgeTone>
  /** A hex colour per value that fills its badge instead of its tone, for `status` columns; a tone name is no colour. */
  colors?: Record<string, string>
  /** The shape of a `status` column's badges. */
  shape?: 'arrow'
  /** Badge text per value, for `status` columns; a value without one reads as itself in words. */
  labels?: Record<string, string>
  /** For a `text` column of addresses: each value a link that writes to, calls or opens it. */
  link?: ContactFormat
  /** For a `user` column: the person behind an id; an id it does not know shows as itself. */
  users?: (id: string) => CellUser | undefined
  /** Reads the cell value; defaults to `row[id]`. */
  value?: (row: GridRow) => unknown
  /** Draws the cell instead of its kind, such as a field type's cell. */
  render?: (row: GridRow) => ReactNode
}

export const isRightAligned = (kind: ColumnKind) => kind === 'money' || kind === 'number' || kind === 'signed' || kind === 'percent'
