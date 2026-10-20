import type { GridRow } from './column-spec'

/**
 * What can be done with the selected rows. `available` narrows them to those the action applies to: it is offered
 * while one of them does, `label` counts those, and `onRun` gets them with how many selected rows it skips.
 */
export type BulkAction = { label: (count: number) => string; destructive?: boolean; available?: (row: GridRow) => boolean; onRun: (rows: GridRow[], skipped: number) => void }

/** The actions offered for `selected`, each with the rows it runs on and how many it skips. */
export const offeredBulkActions = (actions: BulkAction[], selected: GridRow[]) =>
  actions.flatMap((action) => {
    const rows = action.available ? selected.filter(action.available) : selected
    return rows.length === 0 ? [] : [{ action, rows, skipped: selected.length - rows.length }]
  })
