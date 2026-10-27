import { randomUUID } from 'node:crypto'
import type { Db } from '@protobase/query'
import { waitUntil } from '../../functions/wait-until'
import type { Publication } from '../broadcast-hub'
import type { PresenceChange } from '../presence-hub'
import { frameCursor, type FrameCursor } from './frame-cursor'
import { admitBroadcasts, pruneFrames, readFrames, type RelayedFrame } from './relay-frame-sql'
import { beat, presenceSnapshot, restorePresences, retireSelf, retireStale, writePresence, type TrackedPresence } from './relay-presence-sql'

export type RealtimeRelayOptions = {
  db: Db
  statementTimeoutMs: number
  /** Where another process's frame goes. */
  heard: (frame: RelayedFrame) => void
  /** Starts the other processes' presences over, from a snapshot or, as the relay stops, from none. */
  loaded: (presences: readonly TrackedPresence[]) => void
  /** This process's presences, written again once another process took it for stopped. */
  tracked: () => readonly TrackedPresence[]
  /** Where a failed read or write goes; a read is tried again a beat later. */
  report: (error: unknown) => void
  /** How often the frames are read while a socket is open. */
  intervalMs?: number
  /** How often the process marks itself as running, and removes the processes that stopped. */
  beatMs?: number
  /** How long a process may not mark itself before the others take it for stopped. */
  staleSeconds?: number
  now?: () => number
}

type Run = { stopped: boolean; ready: Promise<void>; cursor?: FrameCursor; beaten: number }

/**
 * Broadcasts and presence between the processes serving an app, through the `realtime_relay` schema: each process adds
 * what its channels, the broadcast API and the database send as frames, and, while one of its sockets is open, reads
 * the others' every `intervalMs`, from a snapshot of their presences taken when the first socket opens. The broadcasts
 * into a topic are counted in the database, every process's together. A process marks itself every `beatMs`, and one
 * that has not for `staleSeconds`, as when it was killed, has its presences removed, with a leave for each. A process
 * that stops, its last socket closed, removes its own; graceful shutdown waits for these writes (`backgroundSettled`).
 */
export const realtimeRelay = ({ db, statementTimeoutMs, heard, loaded, tracked, report, intervalMs = 100, beatMs = 5000, staleSeconds = 15, now = () => Date.now() }: RealtimeRelayOptions) => {
  const self = randomUUID()
  let followers = 0
  let run: Run | undefined
  let queue = Promise.resolve()

  // Writes in the order they were asked for, the run's start and stop among them.
  const inTurn = (work: () => Promise<void>) => {
    const next = queue.then(work).catch(report)
    queue = next
    waitUntil(next)
    return next
  }

  const load = async (current: Run) => {
    await beat(db, self)
    const snapshot = await presenceSnapshot(db, statementTimeoutMs, self)
    if (current.stopped) return
    loaded(snapshot.presences)
    current.cursor = frameCursor(snapshot.newest, snapshot.visible, now)
    current.beaten = now()
  }

  const read = async (current: Run, cursor: FrameCursor) => {
    for (;;) {
      const { after, gaps } = cursor.next()
      const batch = await readFrames(db, self, after, gaps)
      if (current.stopped) return
      cursor.read(batch.ids)
      for (const frame of batch.frames) heard(frame)
      if (!batch.full) return
    }
  }

  const keepAlive = async (current: Run) => {
    if (current.stopped || now() - current.beaten < beatMs) return
    current.beaten = now()
    if (await beat(db, self)) void inTurn(() => restorePresences(db, self, tracked()))
    await retireStale(db, staleSeconds)
    await pruneFrames(db)
  }

  // A snapshot that failed is taken again at the next interval.
  const step = async (current: Run) => {
    if (!current.cursor) await load(current)
    if (!current.cursor || current.stopped) return
    await read(current, current.cursor)
    await keepAlive(current)
  }

  // After a failure, such as the database being down, the next try waits a beat, so the errors do not flood `report`.
  const tick = async (current: Run) => {
    if (current.stopped) return
    const done = await step(current).then(
      () => true,
      (error: unknown) => {
        report(error)
        return false
      },
    )
    setTimeout(() => void tick(current), done ? intervalMs : beatMs)
  }

  const start = () => {
    const current: Run = { stopped: false, beaten: 0, ready: Promise.resolve() }
    current.ready = inTurn(() => load(current)).then(() => void setTimeout(() => void tick(current), intervalMs))
    return current
  }

  const stop = (current: Run) => {
    current.stopped = true
    run = undefined
    loaded([])
    void inTurn(() => retireSelf(db, self))
  }

  return {
    /** The process, as its frames and presences name it. */
    id: self,
    /** Reads the other processes' frames from now on, until the returned function is called; once for each call. */
    follow: () => {
      followers += 1
      if (!run) run = start()
      let following = true
      return () => {
        if (!following) return
        following = false
        followers -= 1
        if (followers === 0 && run) stop(run)
      }
    },
    /** Resolves once the other processes' presences are read, or their snapshot failed. */
    ready: () => run?.ready ?? Promise.resolve(),
    /** Counts and adds the broadcasts as frames, all of them or, over a topic's rate, none: `false` then. */
    broadcast: (publications: readonly Publication[]) => admitBroadcasts(db, statementTimeoutMs, self, publications),
    /** Writes a change of this process's presences, after those before it. */
    changed: (change: PresenceChange) => void inTurn(() => writePresence(db, self, change)),
  }
}

export type RealtimeRelay = ReturnType<typeof realtimeRelay>
