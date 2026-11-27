import type { KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { LiveChange } from '../live'

/** One change of a `change` frame on a live topic, as the changes service shapes it: its table's row, by key. */
export type LiveEntryChange = { resource: string; operation: 'insert' | 'update' | 'delete'; key: Record<string, KeyValue> }

/** A `change` frame's payload: one transaction's changes the query matched, and the cursor to resume after it. */
export type LiveEntry = { id: string; cursor: string; changes: LiveEntryChange[] }

const operations = { insert: 'create', update: 'update', delete: 'delete' } as const

/**
 * The changes of a live topic's entry as `client.live` tells them, of `resource`, the one the topic's token was read
 * for: the entry names its table, which may differ. Its key is the record's address key, its values never.
 */
export const liveChangesOf = (resource: string, entry: LiveEntry): LiveChange[] =>
  entry.changes.map((change) => ({ resource, key: encodeKey(Object.values(change.key)), operation: operations[change.operation] }))

/** Whether a frame's payload is a `change` entry. */
export const isLiveEntry = (payload: Record<string, unknown>): payload is LiveEntry => typeof payload.cursor === 'string' && Array.isArray(payload.changes)
