import type { Entry } from '../registry'
import type { Notice } from '../live/notices-sql'
import type { ChangeColumn, SeenRow } from './change-checker'
import type { ChangeEvent } from './postgres-changes'
import { schemaOf } from './postgres-changes'

/** The payload of a `postgres_changes` message, as Supabase Realtime sends it: the bindings it is for and the change. */
export type ChangePayload = {
  ids: number[]
  data: {
    schema: string
    table: string
    commit_timestamp: string
    type: ChangeEvent
    columns: ChangeColumn[]
    record?: SeenRow['record']
    old_record?: SeenRow['oldRecord']
    errors: null
  }
}

/**
 * What a notice is to a database client: a record created is an INSERT; one updated, undeleted or soft deleted, whose
 * row is still there, an UPDATE; one whose row is gone a DELETE.
 */
export const eventOf = (entry: Entry, notice: Notice): ChangeEvent => {
  if (notice.operation === 'create') return 'INSERT'
  if (notice.operation === 'delete' && !entry.model.softDelete) return 'DELETE'
  return 'UPDATE'
}

/**
 * The change for bindings `ids`. An insert or update carries the row as it is now, several changes since the last
 * poll showing its latest state each time, and `old_record` its key alone, as Supabase does without replica identity
 * full. A delete carries the key alone. `commit_timestamp` is when the change became a notice.
 */
export const changePayload = (entry: Entry, notice: Notice, type: ChangeEvent, columns: ChangeColumn[], row: SeenRow, ids: number[]): ChangePayload => ({
  ids,
  data: {
    schema: schemaOf(entry),
    table: entry.model.table.name,
    commit_timestamp: notice.at,
    type,
    columns,
    ...(type !== 'DELETE' && { record: row.record }),
    ...(type !== 'INSERT' && { old_record: row.oldRecord }),
    errors: null,
  },
})
