import type { CallRing } from '@protobase/schema/internal'
import type { RingStore } from '../ring-store'

type Ring = { call: string; user: string; title: string; body: string | null; until: number; stopped: boolean }

/**
 * The `calls` schema's rings in memory, for unit tests: a user is rung once per call, until the ring's time, its stop or
 * the end of its call, which `ended` says. `notices` keeps the users each notice told, in order.
 */
export const memoryRingStore = (ended: (call: string) => boolean = () => false, now = () => Date.now()) => {
  const rings: Ring[] = []
  const notices: string[][] = []
  const ringing = (ring: Ring) => !ring.stopped && ring.until > now()
  const store: RingStore = {
    start: async (call, userIds, { title, body }, seconds) => {
      const fresh = userIds.filter((user) => !rings.some((ring) => ring.call === call && ring.user === user))
      for (const user of fresh) rings.push({ call, user, title, body, until: now() + seconds * 1000, stopped: false })
      return fresh
    },
    stop: async (call, userId) => {
      const ring = rings.find((candidate) => candidate.call === call && candidate.user === userId && ringing(candidate))
      if (ring) ring.stopped = true
      return Boolean(ring)
    },
    stopEnded: async () => {
      const stopped = rings.filter((ring) => ringing(ring) && ended(ring.call))
      for (const ring of stopped) ring.stopped = true
      return [...new Set(stopped.map((ring) => ring.user))]
    },
    of: async (userId) =>
      rings
        .filter((ring) => ring.user === userId && ringing(ring) && !ended(ring.call))
        .reverse()
        .map((ring): CallRing => ({ call: ring.call, resource: 'conversations', key: '1', started_by: '', title: ring.title, body: ring.body, remaining_ms: ring.until - now() })),
    notice: async (userIds) => {
      if (userIds.length > 0) notices.push([...userIds])
    },
  }
  return Object.assign(store, { rings, notices })
}
