import type { Db } from '@protobase/query'
import type { CallRemoteTrack } from '@protobase/schema/internal'
import { recordCalls, rosters, type CallItem, type RosterMember } from './call-reads'
import { takeSignals, writeSignal, type StoredSignal } from './call-signals-sql'
import { admit, heartbeat, leave, remove, setTracks, type Admission, type AdmitInput, type CallRecord } from './call-store'
import { sweepCalls } from './call-sweep'

/** Where calls, their members and the signals between processes are kept: the `calls` schema, or memory in tests. */
export type CallStore = {
  admit: (input: AdmitInput) => Promise<Admission>
  leave: (row: string, process: string) => Promise<void>
  remove: (call: string, member: string) => Promise<boolean>
  setTracks: (row: string, process: string, tracks: CallRemoteTrack[]) => Promise<void>
  heartbeat: (process: string, rows: readonly string[]) => Promise<void>
  sweep: () => Promise<void>
  rosters: (calls: readonly string[]) => Promise<Map<string, { ended: boolean; members: RosterMember[] }>>
  recordCalls: (records: readonly CallRecord[]) => Promise<Map<string, CallItem[]>>
  writeSignal: (signal: Omit<StoredSignal, 'id'>) => Promise<void>
  takeSignals: (process: string, limit: number) => Promise<StoredSignal[]>
}

/** The `calls` schema of the app's database; writes under the API's statement timeout. */
export const sqlCallStore = (db: Db, timeoutMs: number): CallStore => ({
  admit: (input) => admit(db, timeoutMs, input),
  leave: (row, process) => leave(db, timeoutMs, row, process),
  remove: (call, member) => remove(db, timeoutMs, call, member),
  setTracks: (row, process, tracks) => setTracks(db, row, process, tracks),
  heartbeat: (process, rows) => heartbeat(db, process, rows),
  sweep: () => sweepCalls(db, timeoutMs),
  rosters: (calls) => rosters(db, calls),
  recordCalls: (records) => recordCalls(db, records),
  writeSignal: (signal) => writeSignal(db, signal),
  takeSignals: (process, limit) => takeSignals(db, process, limit),
})
