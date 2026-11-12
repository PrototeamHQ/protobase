import type { GridRow } from './column-spec'

/**
 * What can be done with the selected rows. `available` narrows them to those the action applies to: it is offered
 * while one of them does, `label` counts those, and `onRun` gets them with how many selected rows it skips. One that asks
 * first returns a promise of the rows still open once it ends, such as those it was refused: all of them when its dialog
 * is cancelled.
 */
export type BulkAction = { label: (count: number) => string; destructive?: boolean; available?: (row: GridRow) => boolean; onRun: (rows: GridRow[], skipped: number) => void | Promise<GridRow[]> }

/** The actions offered for `selected`, each with the rows it runs on and how many it skips. */
export const offeredBulkActions = (actions: BulkAction[], selected: GridRow[]) =>
  actions.flatMap((action) => {
    const rows = action.available ? selected.filter(action.available) : selected
    return rows.length === 0 ? [] : [{ action, rows, skipped: selected.length - rows.length }]
  })

/** Runs `action` on `rows` and resolves to those it is done with, to deselect: all of them unless its promise names some still open. */
export const runBulkAction = async (action: BulkAction, rows: GridRow[], skipped: number) => {
  const open = await action.onRun(rows, skipped)
  if (!open) return rows
  const kept = new Set(open.map((row) => row.id))
  return rows.filter((row) => !kept.has(row.id))
}

/** A `runBulkAction` that starts no second run while one is in flight: a press meanwhile resolves to nothing. */
export const oneBulkRunAtATime = () => {
  let running = false
  return async (action: BulkAction, rows: GridRow[], skipped: number) => {
    if (running) return
    running = true
    try {
      return await runBulkAction(action, rows, skipped)
    } finally {
      running = false
    }
  }
}
