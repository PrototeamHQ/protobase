import { fixedWindows } from './fixed-window'
import { realtimeLimits } from './realtime-limits'

/** A joined channel as a broadcast hears it: whether it hears its own, and where they go. */
export type BroadcastMember = {
  self: boolean
  receive: (event: string, payload: unknown) => void
}

/**
 * The channels of a process by topic, which hear each other's broadcasts in-process: a cloud app runs as one process,
 * so channels of other processes are not reached. A topic takes `realtimeLimits.topicBroadcastsPerSecond`, whoever sends
 * them; its window is kept here, so a topic left empty and joined again does not start a new one.
 */
export const broadcastHub = ({ now = () => Date.now() }: { now?: () => number } = {}) => {
  const topics = new Map<string, Set<BroadcastMember>>()
  const rate = fixedWindows(realtimeLimits.topicBroadcastsPerSecond, 1000, now)

  return {
    /** Puts the member on the topic until the returned function takes it off. */
    join: (topic: string, member: BroadcastMember) => {
      const members = topics.get(topic) ?? new Set()
      topics.set(topic, members.add(member))
      return () => {
        members.delete(member)
        if (members.size === 0 && topics.get(topic) === members) topics.delete(topic)
      }
    },
    /**
     * Sends a broadcast to the topic's members, the sender only when it hears its own. `false`, sending nothing, when the
     * topic has taken its broadcasts for this second.
     */
    send: (topic: string, from: BroadcastMember, event: string, payload: unknown) => {
      if (!rate(topic)) return false
      for (const member of topics.get(topic) ?? []) {
        if (member !== from || member.self) member.receive(event, payload)
      }
      return true
    },
  }
}

export type BroadcastHub = ReturnType<typeof broadcastHub>
