import { createHash } from 'node:crypto'
import { recordTable, recordTableSql, type RecordModel } from '@protobase/server/internal'

// The last lines of every migration Protobase writes: the statements that make the record of migrations when it is
// missing, then the insert of the file's own row, so the file records itself whichever runner applies it.

/** The line the record block starts with, followed by the file's id. */
export const recordMarker = '-- protobase:record'

/** What a file's row records; `additive` null when unknown, as for a file filled by hand, which `migrate` then fills. */
export type RecordRow = {
  id: string
  /** The file's number; null for a row no file inserts, such as a release's (`migrate-release`). */
  number: number | null
  name: string
  protobaseVersion: string
  model: RecordModel
  modelHash: string
  physical: Record<string, unknown>
  additive: boolean | null
  /** Whether the file is done once its transaction commits: false when an `.after.sql` follows it. */
  completed: boolean
}

const literal = (value: string | number | boolean | null) => {
  if (value === null) return 'null'
  if (typeof value !== 'string') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

/** The text before the file's record block, which its hash covers. */
export const textBeforeRecord = (text: string) => {
  const at = text.search(new RegExp(`^${recordMarker} `, 'm'))
  return at === -1 ? text : text.slice(0, at)
}

/** The SHA-256 of a file's text without its record block, with CRLF line endings read as LF. */
export const sqlHash = (text: string) => createHash('sha256').update(textBeforeRecord(text).replaceAll('\r\n', '\n')).digest('hex')

/** The id in a file's record block; `undefined` when it has none. */
export const recordId = (text: string) => new RegExp(`^${recordMarker} (\\S+)$`, 'm').exec(text)?.[1]

/** The record block of the file whose text before it hashes to `hash`; `null` when that text is still to be written by hand. */
export const recordBlock = (row: RecordRow, hash: string | null) => {
  const columns = 'id, number, name, protobase_version, model, model_hash, physical, additive, sql_hash, completed_at'
  const values = [
    literal(row.id),
    literal(row.number),
    literal(row.name),
    literal(row.protobaseVersion),
    `${literal(JSON.stringify(row.model))}::jsonb`,
    literal(row.modelHash),
    `${literal(JSON.stringify(row.physical))}::jsonb`,
    literal(row.additive),
    literal(hash),
    row.completed ? 'clock_timestamp()' : 'null',
  ].join(', ')
  return `${recordMarker} ${row.id}\n-- The row that records this migration as applied, which the server reads at startup.\n${recordTableSql}\ninsert into ${recordTable} (${columns}) values (${values});\n`
}
