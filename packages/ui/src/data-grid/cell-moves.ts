/** A cell of the grid: its row's index among all rows, and its column. */
export type CellPlace = { index: number; column: string }

export type MoveKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export const isMoveKey = (key: string): key is MoveKey => key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'

/** The cell an arrow key moves to from `at` among `total` rows of `columns`, or undefined at the grid's edge. */
export const movedCell = (at: CellPlace, key: MoveKey, columns: readonly string[], total: number): CellPlace | undefined => {
  const column = columns.indexOf(at.column)
  if (key === 'ArrowUp') return at.index > 0 ? { ...at, index: at.index - 1 } : undefined
  if (key === 'ArrowDown') return at.index < total - 1 ? { ...at, index: at.index + 1 } : undefined
  const next = columns[key === 'ArrowLeft' ? column - 1 : column + 1]
  return column >= 0 && next !== undefined ? { ...at, column: next } : undefined
}

/** The editable column after (`1`) or before (`-1`) `column` in its row, or undefined when there is none. */
export const nextEditable = (column: string, columns: readonly string[], editable: (column: string) => boolean, direction: 1 | -1) => {
  const from = columns.indexOf(column)
  const after = direction === 1 ? columns.slice(from + 1) : columns.slice(0, Math.max(0, from)).reverse()
  return after.find(editable)
}
