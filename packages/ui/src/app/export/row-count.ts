/** How many rows the list finds: exact up to 10,000, the planner's estimate above, or still being counted. */
export type RowCount = { kind: 'counting' } | { kind: 'exact'; rows: number } | { kind: 'estimate'; rows: number }

/** The fewest rows the list finds, as far as the count tells: an estimate stands only above 10,000. */
export const countedRows = (count: RowCount) => {
  if (count.kind === 'counting') return undefined
  return count.kind === 'exact' ? count.rows : Math.max(count.rows, 10_001)
}
