import type { DragWrite } from '../hand-order/undo-ops'

type Stored = { record: Record<string, unknown>; etag: string }

/**
 * What undoes a drop that saved `value` in `set`: the record as listed, the record read again after the update, and the
 * ETag to send. That is the reread's while it still holds `value`, since the database's triggers may have written the
 * record again after the update, so the update's own ETag is stale; once someone else changed `set` in between, the
 * update's own, so Undo is refused rather than writing over their change.
 */
export const setUndo = (before: Record<string, unknown>, set: string, value: unknown, written: Stored, stored: Stored): DragWrite => ({
  before,
  record: stored.record,
  etag: stored.record[set] === value ? stored.etag : written.etag,
})
