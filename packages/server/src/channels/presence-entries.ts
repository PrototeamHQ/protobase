import type { PresenceDiff, PresenceState } from '../realtime/presence-hub'
import type { ChannelUser, PresenceEntry } from './channel-protocol'

/** What a record channel tracks in the presence hub, under the connection's own key: its user and its state. */
export type TrackedState = { user: ChannelUser; state: unknown }

/** The hub's presences as entries: each key is one connection on the channel, so it holds one presence at most. */
export const entriesOf = (state: PresenceState): PresenceEntry[] =>
  Object.entries(state).flatMap(([id, { metas }]) => metas.map(({ user, state: tracked }) => ({ id, user: user as ChannelUser, state: tracked })))

/**
 * A hub diff as joins, updates and leaves: a key that left and joined in one diff tracked again, an update. A key
 * that joins without the leave of its old state, as from another process whose leave this one never saw, is a join.
 */
export const entryDiff = (diff: PresenceDiff) => {
  const joined = entriesOf(diff.joins)
  const left = entriesOf(diff.leaves)
  const joinedIds = new Set(joined.map((entry) => entry.id))
  const leftIds = new Set(left.map((entry) => entry.id))
  return {
    joins: joined.filter((entry) => !leftIds.has(entry.id)),
    updates: joined.filter((entry) => leftIds.has(entry.id)),
    leaves: left.filter((entry) => !joinedIds.has(entry.id)),
  }
}
