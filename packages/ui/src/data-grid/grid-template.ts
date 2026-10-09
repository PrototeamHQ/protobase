import type { ColumnSpec } from './column-spec'

/** Wide enough for the checkbox plus the largest row number, with thousands separators. */
export const gutterWidthFor = (total: number) => 52 + Math.ceil(String(total).length * 1.33) * 7

export const rowMenuWidth = 40

/** On phones the gutter holds only the checkbox, leaving room for the columns. */
export const compactGutter = 40

/** Columns may shrink to this share of their width on desktop; on narrow screens they keep it whole and the grid scrolls. */
export const desktopMinScale = 0.6

const minWidthOf = (spec: ColumnSpec, minScale: number) => Math.max(spec.minWidth ?? 0, spec.width * minScale)

const columnTemplate = (spec: ColumnSpec, minScale: number) =>
  spec.fixed ? `${Math.max(spec.minWidth ?? 0, spec.width)}px` : `minmax(${minWidthOf(spec, minScale)}px, ${spec.width}fr)`

export const gridTemplate = (specs: ColumnSpec[], gutter: number, trailing = 0, minScale = desktopMinScale) =>
  `${gutter}px ${specs.map((spec) => columnTemplate(spec, minScale)).join(' ')}${trailing > 0 ? ` ${trailing}px` : ''}`

/** The narrowest the grid can be before it has to scroll sideways. */
export const gridMinWidth = (specs: ColumnSpec[], gutter: number, trailing = 0, minScale = desktopMinScale) =>
  gutter + trailing + specs.reduce((sum, spec) => sum + (spec.fixed ? Math.max(spec.minWidth ?? 0, spec.width) : minWidthOf(spec, minScale)), 0)
