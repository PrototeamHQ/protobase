import type { RecordModel } from './record-model'
import type { AfterIndex } from './record-table'

/** What the startup reads of the record, in one query (`readRecordState`). */
export type RecordState = {
  /** The newest row; `undefined` when the database has no record or an empty one. */
  newest: { name: string; version: string; model: RecordModel; hash: string } | undefined
  /** Whether a row records the runtime's model. */
  matched: boolean
  /** The rows after the newest that records the runtime's model which are not marked additive, by name, in order. */
  notAdditiveSince: string[]
  /** The rows whose `.after.sql` has not finished, with the indexes it builds; `after` null when that is not recorded. */
  unfinished: { name: string; after: AfterIndex[] | null }[]
}
