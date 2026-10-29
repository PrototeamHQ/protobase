import type { Db } from '@protobase/query'
import { pruneSends } from '../channels/sends-prune'
import { pruneBroadcasts } from './broadcast-prune'
import { pruneSchedule } from './prune-schedule'
import { pruneFrames } from './relay/relay-frame-sql'

export type RealtimePruneOptions = {
  db: Db
  statementTimeoutMs: number
  /** Whether the app's processes relay through `realtime_relay`, whose frames and counts are pruned too. */
  relayed: boolean
  /** Whether SQL sends to the record channels through `channels.sends`, whose old rows are pruned too. */
  sqlSends: boolean
  /** Where a failed prune goes; the next one tries again. */
  report: (error: unknown) => void
}

/**
 * Prunes what the realtime tables keep whether or not a socket is open, as on an app that never opens one: the old
 * broadcast rows of `realtime.messages`, relayed, the relay's old frames and counts and, with `sqlSends`, the old
 * rows of `channels.sends`, on `pruneSchedule`. It runs only while the process does, so it never wakes a sleeping app.
 */
export const startRealtimePrune = ({ db, statementTimeoutMs, relayed, sqlSends, report }: RealtimePruneOptions) =>
  pruneSchedule([() => pruneBroadcasts(db, statementTimeoutMs), ...(relayed ? [() => pruneFrames(db)] : []), ...(sqlSends ? [() => pruneSends(db, statementTimeoutMs)] : [])], report)

export type RealtimePrune = ReturnType<typeof startRealtimePrune>
