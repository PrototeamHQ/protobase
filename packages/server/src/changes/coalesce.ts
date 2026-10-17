import type { EventActor } from '@protobase/schema'
import type { Row } from '../types'

/** A row of the outbox: one row's insert, update or delete, its columns as `changes.capture()` kept them. */
export type CapturedRow = {
  /** The outbox id: commit order for the changes of one record. */
  id: string
  transaction: string
  /** The resource whose table changed, which its trigger names. */
  resource: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  old: Row | null
  new: Row | null
  /** The columns an update changed, sensitive ones included; `null` for inserts and deletes. */
  changed: string[] | null
  actor: EventActor | null
  /** The database role that wrote; `null` for a row captured before Protobase kept it. */
  databaseRole: string | null
  /** When the writing transaction started, ISO 8601. */
  at: string
}

/**
 * One record's changes in one transaction, as one: its columns at the start (`before`, none when it was inserted) and
 * at commit (`after`, none when it was deleted), and for an update the columns that differ, sensitive ones included.
 */
export type CoalescedChange = {
  transaction: string
  resource: string
  before: Row | null
  after: Row | null
  changed: string[]
  actor: EventActor | null
  /** The database role of its last change. */
  databaseRole: string | null
  /** The id of its last outbox row. */
  sequence: string
  /** When its last change's transaction started. */
  at: string
}

type Group = { first: CapturedRow; last: CapturedRow; actor: EventActor | null; listed: Set<string> }

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

const recordKey = (row: CapturedRow, columns: Row | null, keyColumns: readonly string[]) =>
  JSON.stringify([row.transaction, row.resource, ...keyColumns.map((column) => columns?.[column] ?? null)])

// The columns that differ at the end. A sensitive column is never in the rows, so once listed it stays changed.
const changedColumns = (before: Row, after: Row, listed: Set<string>) =>
  [...new Set([...listed, ...Object.keys(before), ...Object.keys(after)])].filter((column) => {
    const kept = column in before || column in after
    return !kept || !sameValue(before[column], after[column])
  })

const merged = ({ first, last, actor, listed }: Group): CoalescedChange[] => {
  const base = { transaction: first.transaction, resource: first.resource, actor, databaseRole: last.databaseRole, sequence: last.id, at: last.at }
  const before = first.op === 'INSERT' ? null : first.old
  const after = last.op === 'DELETE' ? null : last.new
  if (!before && !after) return []
  if (!before || !after) return [{ ...base, before, after, changed: [] }]
  const changed = changedColumns(before, after, listed)
  return changed.length > 0 ? [{ ...base, before, after, changed }] : []
}

/**
 * The outbox rows of one or more transactions, in id order, as one change per (transaction, record). An insert then a
 * delete is nothing, and so is an update that ends where it started; a delete then an insert of the same key is an
 * update. `keyColumns` names a resource's primary key columns, which identify its records.
 */
export const coalesce = (rows: readonly CapturedRow[], keyColumns: (resource: string) => readonly string[]) => {
  const current = new Map<string, Group>()
  const groups: Group[] = []
  for (const row of rows) {
    const columns = keyColumns(row.resource)
    const key = recordKey(row, row.op === 'INSERT' ? row.new : row.old, columns)
    let group = current.get(key)
    if (!group) {
      group = { first: row, last: row, actor: row.actor, listed: new Set() }
      groups.push(group)
    }
    group.last = row
    group.actor = row.actor ?? group.actor
    for (const column of row.changed ?? []) group.listed.add(column)
    // A record's group follows its key, so a later change of the record finds it after an update of the key.
    current.delete(key)
    current.set(row.op === 'DELETE' ? key : recordKey(row, row.new, columns), group)
  }
  return groups.flatMap(merged)
}
