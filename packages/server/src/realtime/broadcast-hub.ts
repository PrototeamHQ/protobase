import { fixedWindows } from './fixed-window'
import { realtimeLimits } from './realtime-limits'

/** A joined channel as a broadcast hears it: whether it hears its own, whether it joined private, and where they go. */
export type BroadcastMember = {
  self: boolean
  private: boolean
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
    /**
     * Sends broadcasts that no channel sends, all of them or, when a topic would take more than its broadcasts for this
     * second, none: `false` then.
     */
    publish: (publications: readonly Publication[]) => {
      const takes = new Map<string, number>()
      for (const { topic } of publications) takes.set(topic, (takes.get(topic) ?? 0) + 1)
      if (!rate.all(takes)) return false
      for (const publication of publications) {
        for (const member of topics.get(publication.topic) ?? []) {
          if (!publication.private || member.private) member.receive(publication.event, publication.payload)
        }
      }
      return true
    },
  }
}

/** A broadcast sent without a channel, such as over `POST /api/broadcast`; a private one reaches private channels only. */
export type Publication = {
  topic: string
  event: string
  payload: unknown
  private: boolean
}

export type BroadcastHub = ReturnType<typeof broadcastHub>
