import type { CSSProperties, ReactNode } from 'react'

/** One column of the line table: its heading, the grid track it takes, and what each line shows in it. */
export type LineColumn<L> = {
  key: string
  label: string
  align?: 'right'
  /** A CSS grid track, such as `88px`; a share of the free width, at least 8rem, when omitted. */
  width?: string
  cell: (line: L) => ReactNode
}

const track = (column: LineColumn<never>) => column.width ?? 'minmax(8rem,1fr)'

/** The columns' tracks, between the drag handle and the menu that `lineGrid` places around them. */
export const lineGridStyle = (columns: LineColumn<never>[]) => ({ '--line-columns': columns.map(track).join(' ') }) as CSSProperties

/** The narrowest the table gets before it scrolls sideways: each column's least width, and the handle and menu. */
export const lineTableMinWidth = (columns: LineColumn<never>[]) => `${columns.reduce((sum, column) => sum + (column.width?.endsWith('px') ? parseInt(column.width) / 16 : 8), 6)}rem`

export const lineGrid = 'grid grid-cols-[28px_var(--line-columns)_32px] items-center gap-2 pointer-coarse:grid-cols-[44px_var(--line-columns)_44px]'
