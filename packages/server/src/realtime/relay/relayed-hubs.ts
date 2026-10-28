import type { Db } from '@protobase/query'
import { broadcastHub, type BroadcastHub, type Publication } from '../broadcast-hub'
import { presenceHub } from '../presence-hub'
import { presenceReplica } from './presence-replica'
import { realtimeRelay } from './realtime-relay'
import type { RelaySpace } from './relay-schema-sql'

export type RelayedHubsOptions = {
  db: Db
  statementTimeoutMs: number
  report: (error: unknown) => void
}

/**
 * The broadcast and presence hubs of `realtime: { processes: 'many' }`, one pair for each space (`RelaySpace`): this
 * process's channels in memory, as with one process, and every broadcast and presence change written to the relay for
 * the other processes, whose own reach the channels here as the relay reads them, in the space they were sent in. A
 * topic's private and public channels stay apart across processes too. A broadcast reaches this process's channels
 * once the relay admitted it under the topic's rate. `follow` reads the relay while a socket is open.
 */
export const relayedHubs = ({ db, statementTimeoutMs, report }: RelayedHubsOptions) => {
  const spaces = new Map<RelaySpace, ReturnType<typeof spaceOf>>()
  const relay = realtimeRelay({
    db,
    statementTimeoutMs,
    report,
    heard: (frame) => {
      const space = spaces.get(frame.space)
      if (!space) return
      if (frame.kind === 'broadcast') return space.local.deliver(frame.publication)
      const diff = space.replica.apply(frame.topic, frame.private, frame.diff)
      if (diff) space.presences.hear(frame.topic, frame.private, diff)
    },
    loaded: (tracked) => {
      for (const [name, space] of spaces) space.replica.load(tracked.filter((presence) => presence.space === name))
    },
    tracked: () => [...spaces].flatMap(([name, space]) => space.presences.tracked().map((presence) => ({ space: name, ...presence }))),
  })

  const spaceOf = (name: RelaySpace) => {
    const local = broadcastHub()
    const replica = presenceReplica()
    const presences = presenceHub({ refPrefix: `${relay.id}:`, remote: { state: replica.state, changed: (change) => relay.changed(name, change), ready: relay.ready } })
    const broadcasts: BroadcastHub = {
      join: local.join,
      send: async (topic, from, event, payload) => {
        const publication: Publication = { topic, event, payload, private: from.private }
        if (!(await relay.broadcast(name, [publication]))) return false
        local.deliver(publication, from)
        return true
      },
      publish: async (publications) => {
        if (!(await relay.broadcast(name, publications))) return false
        for (const publication of publications) local.deliver(publication)
        return true
      },
    }
    return { local, replica, presences, broadcasts }
  }
  for (const name of ['topics', 'records'] as const) spaces.set(name, spaceOf(name))

  const hubsOf = (name: RelaySpace) => {
    const { broadcasts, presences } = spaces.get(name)!
    return { broadcasts, presences }
  }
  return { topics: hubsOf('topics'), records: hubsOf('records'), follow: relay.follow }
}
