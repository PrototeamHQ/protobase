import type { Db } from '@protobase/query'
import type { CallRing } from '@protobase/schema/internal'
import { ringsOf, startRings, stopEndedRings, stopRing, writeRingNotices, type RingText } from './rings-sql'

/** Where the rings of calls are kept and their users' pages told of them: the `calls` schema, or memory in tests. */
export type RingStore = {
  start: (call: string, userIds: readonly string[], text: RingText, seconds: number) => Promise<string[]>
  stop: (call: string, userId: string) => Promise<boolean>
  stopEnded: () => Promise<string[]>
  of: (userId: string) => Promise<CallRing[]>
  /** Tells these users' open pages that the calls ringing them changed. */
  notice: (userIds: readonly string[]) => Promise<void>
}

/** The `calls` schema's rings, and the notices table of the changes schema `notices`. */
export const sqlRingStore = (db: Db, notices: string): RingStore => ({
  start: (call, userIds, text, seconds) => startRings(db, call, userIds, text, seconds),
  stop: (call, userId) => stopRing(db, call, userId),
  stopEnded: () => stopEndedRings(db),
  of: (userId) => ringsOf(db, userId),
  notice: (userIds) => writeRingNotices(db, notices, userIds),
})
