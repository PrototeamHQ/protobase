import type { CallRing, LiveHandlers, RingsClient } from '@protobase/client'
import { ringNotice } from '@protobase/schema/internal'

/**
 * The calls ringing the signed-in user, for stories: `declined` the calls declined on this page, and `elsewhere` ends
 * the rings as an answer on another device does, telling the page over its live stream.
 */
export const fakeRings = (initial: CallRing[]) => {
  let rings = [...initial]
  const declined: string[] = []
  const listeners = new Set<LiveHandlers>()
  const client: RingsClient = {
    list: async () => rings,
    decline: async (call) => {
      declined.push(call)
      rings = rings.filter((ring) => ring.call !== call)
    },
  }
  return {
    client,
    declined,
    live: (handlers: LiveHandlers) => {
      listeners.add(handlers)
      return () => void listeners.delete(handlers)
    },
    elsewhere: () => {
      rings = []
      for (const listener of listeners) listener.onChanges([{ resource: ringNotice, key: 'story', operation: 'update' }])
    },
  }
}

export type FakeRings = ReturnType<typeof fakeRings>
