import type { ColumnSpec } from './column-spec'

/**
 * The columns pinned until the user chooses: the leading columns through the title column, when it is first or second.
 * Pinned columns move to the front, so a title further right stays unpinned rather than reorder the list; pins only
 * take effect once the grid is too wide and scrolls sideways.
 */
export const defaultPins = (specs: ColumnSpec[]) => {
  const index = specs.findIndex((spec) => spec.title)
  if (index < 0 || index > 1) return []
  return specs.slice(0, index + 1).map((spec) => spec.id)
}
