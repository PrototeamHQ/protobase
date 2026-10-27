import type { Db } from '@protobase/query'
import { broadcastHub, type BroadcastHub, type Publication } from '../broadcast-hub'
import { presenceHub } from '../presence-hub'
import { presenceReplica } from './presence-replica'
import { realtimeRelay } from './realtime-relay'

export type RelayedHubsOptions = {
  db: Db
  statementTimeoutMs: number
  report: (error: unknown) => void
}

/**
 * The broadcast and presence hubs of `realtime: { processes: 'many' }`: this process's channels in memory, as with one
 * process, and every broadcast and presence change written to the relay for the other processes, whose own reach the
 * channels here as the relay reads them. A topic's private and public channels stay apart across processes too. A
 * broadcast reaches this process's channels once the relay admitted it under the topic's rate. `follow` reads the
 * relay while a socket is open.
 */
export const relayedHubs = ({ db, statementTimeoutMs, report }: RelayedHubsOptions) => {
  const local = broadcastHub()
  const replica = presenceReplica()
  const relay = realtimeRelay({
    db,
    statementTimeoutMs,
    report,
    heard: (frame) => {
      if (frame.kind === 'broadcast') return local.deliver(frame.publication)
      const diff = replica.apply(frame.topic, frame.private, frame.diff)
      if (diff) presences.hear(frame.topic, frame.private, diff)
    },
    loaded: replica.load,
    tracked: () => presences.tracked(),
  })
  const presences = presenceHub({ refPrefix: `${relay.id}:`, remote: { state: replica.state, changed: relay.changed, ready: relay.ready } })

  const broadcasts: BroadcastHub = {
    join: local.join,
    send: async (topic, from, event, payload) => {
      const publication: Publication = { topic, event, payload, private: from.private }
      if (!(await relay.broadcast([publication]))) return false
      local.deliver(publication, from)
      return true
    },
    publish: async (publications) => {
      if (!(await relay.broadcast(publications))) return false
      for (const publication of publications) local.deliver(publication)
      return true
    },
  }

  return { broadcasts, presences, follow: relay.follow }
}
