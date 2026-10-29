import type { Db } from '@protobase/query'
import type { SocketEvents } from '../functions/function-socket'
import { callHub, type CallDoor } from './call-hub'
import type { CallRights } from './call-member'
import type { CallRingInput } from './call-ring'
import { recordId, type CallItem } from './call-reads'
import type { CallRecord } from './call-store'
import { callWatch } from './call-watch'
import { defaultMaxMinutes, maxMembersOf, type CallBackend, type CallsOptions } from './calls-options'
import { sqlCallStore, type CallStore } from './calls-store'
import type { MediaBackend } from './media-backend'
import { memberRelay } from './member-relay'
import type { Ringer } from './ringer'

export type CallsRuntimeInput = {
  db: Db
  timeoutMs: number
  options: CallsOptions
  report: (error: unknown) => void
  /** Memory in tests; the `calls` schema otherwise. */
  store?: CallStore
  /** The rings of calls, which joins with a `ring` start. */
  rings?: Ringer
  /** Tells the record's readers its calls changed, such as on the record's channel. */
  announce?: (record: CallRecord, items: CallItem[]) => Promise<void>
}

/** How often the calls this process serves, and the records its pages follow, are read. */
const readEveryMs = 1000
/** Every how many reads the process tells its members' records it still serves them, and sweeps every call. */
const beatEvery = 5

// The plugin a backend's settings name, loaded only when a member first joins.
const loadBackend = async (settings: CallBackend): Promise<MediaBackend> => {
  if (settings.kind === 'livekit') return (await import('./livekit/livekit-session')).liveKitBackend(settings)
  return (await import('./peer/peer-backend')).peerBackend(settings)
}

/**
 * An app's calls on this process: the members it serves, through the configured plugin, and the records whose calls
 * its pages follow. While it serves a member or a page, it reads them every second and, every five, marks its members
 * as served and sweeps every call, whichever process served it; with neither, it runs no timer.
 */
export const callsRuntime = ({ db, timeoutMs, options, report, store = sqlCallStore(db, timeoutMs), rings, announce }: CallsRuntimeInput) => {
  const hub = callHub({ store, manyProcesses: options.processes === 'many', report })
  const watch = callWatch(store)
  const maxMembers = maxMembersOf(options.backend)
  const maxMinutes = options.maxMinutes ?? defaultMaxMinutes
  let backend: Promise<MediaBackend> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let reads = 0

  // The record's calls, as they are now, to its readers; a failure is reported and the next change tells them again.
  const changed = (records: readonly CallRecord[]) => {
    if (!announce) return
    for (const record of records) {
      void store
        .recordCalls([record])
        .then((found) => announce(record, found.get(recordId(record)) ?? []))
        .catch(report)
    }
  }
  const sweep = async () => {
    changed(await store.sweep())
    await rings?.settle()
  }

  const busy = () => hub.size > 0 || watch.size > 0
  const tick = async () => {
    reads++
    if (reads % beatEvery === 0) {
      await hub.beat()
      await sweep()
    }
    await hub.refreshAll()
    await watch.read()
  }
  const schedule = () => {
    if (timer || !busy()) return
    timer = setTimeout(() => {
      void tick()
        .catch(report)
        .finally(() => {
          timer = undefined
          schedule()
        })
    }, readEveryMs)
    ;(timer as { unref?: () => void }).unref?.()
  }

  const door: CallDoor = {
    admit: async ({ user, ring, ...input }, link) => {
      const admitted = await hub.admit(input, link)
      schedule()
      if ('refused' in admitted) return admitted
      changed([input.record])
      // A ring that fails leaves the member in the call: it is reported, and only the ring is missing.
      if (rings && user !== undefined) {
        if (ring && admitted.started) await rings.start(admitted.call, input.record, user, ring).catch(report)
        await rings.stop(admitted.call, user).catch(report)
      }
      return {
        ...admitted,
        leave: async () => {
          await admitted.leave()
          changed([input.record])
          await rings?.settle()
        },
      }
    },
  }

  return {
    /** The events of the member's socket, relayed to the plugin: they come into the record's call at their `join`. */
    relay: async (record: CallRecord, member: string, rights: CallRights, by: { user?: string; ring?: CallRingInput } = {}): Promise<SocketEvents> => {
      backend ??= loadBackend(options.backend)
      return memberRelay({ door, backend: await backend, record, member, rights, maxMembers, maxMinutes, report, ...by })
    },
    /** Removes the member from the call, and only from it: whether they were in it. */
    remove: async (call: string, member: string) => {
      const record = await store.recordOf(call)
      const removed = await store.remove(call, member)
      await hub.refresh([call])
      if (record) changed([record])
      await rings?.settle()
      return removed
    },
    /** The calls that ring the user now, and declining one. */
    rings: () => {
      if (!rings) throw new Error('Not implemented: rings without a ring store')
      return rings
    },
    /** The record's latest calls, newest first, once every call that should have ended has. */
    of: async (record: CallRecord): Promise<CallItem[]> => {
      await sweep()
      return (await store.recordCalls([record])).get(recordId(record)) ?? []
    },
    /** Tells `listener` the record's calls now and whenever they change, until the returned function is called. */
    watch: async (record: CallRecord, listener: (items: CallItem[]) => void) => {
      await sweep()
      const stop = await watch.add(record, listener)
      schedule()
      return stop
    },
  }
}

export type CallsRuntime = ReturnType<typeof callsRuntime>
