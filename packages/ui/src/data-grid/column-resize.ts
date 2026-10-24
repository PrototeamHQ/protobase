import type { ColumnSpec } from './column-spec'

/** The narrowest a column can be dragged: room for a few letters of its header and its menu button. */
export const minColumnWidth = 64

/** Pixels an arrow key moves a column's edge. */
export const resizeStep = 16

/**
 * The width a column dragged `delta` pixels from `start` takes, never below `minColumnWidth`, or below `start` for a
 * column the app made narrower than that, such as one of check marks.
 */
export const resizedWidth = (start: number, delta: number) => Math.max(Math.min(minColumnWidth, start), Math.round(start + delta))

/**
 * `specs` with the widths a resize set them to: those columns take that width whole, even below the minimum width the
 * app gave them, as `resizedWidth` keeps them usable.
 */
export const withResizedWidths = (specs: ColumnSpec[], widths: Record<string, number>) =>
  specs.map((spec) => (spec.id in widths ? { ...spec, fixed: true, width: widths[spec.id]!, minWidth: undefined } : spec))
