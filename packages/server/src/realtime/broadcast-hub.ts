import type { BroadcastMeta } from './broadcast-frame'
import { fixedWindows } from './fixed-window'
import { realtimeLimits } from './realtime-limits'

/** A joined channel as a broadcast hears it: whether it hears its own, whether it joined private, and where they go. */
export type BroadcastMember = {
  self: boolean
  private: boolean
  receive: (event: string, payload: unknown, meta?: BroadcastMeta) => void
}

/**
 * The channels of a process by topic, which hear each other's broadcasts in-process; with several processes,
 * `relayedHubs` carries them between them through this hub's `deliver`. Private and public channels of a topic do not hear each other, as on
 * Supabase, so a public channel cannot reach past the policies of a private one. A topic takes `realtimeLimits.topicBroadcastsPerSecond`, whoever sends
 * them; its window is kept here, so a topic left empty and joined again does not start a new one.
 */
export const broadcastHub = ({ now = () => Date.now() }: { now?: () => number } = {}) => {
  const publicTopics = new Map<string, Set<BroadcastMember>>()
  const privateTopics = new Map<string, Set<BroadcastMember>>()
  const topicsOf = (isPrivate: boolean) => (isPrivate ? privateTopics : publicTopics)
  const rate = fixedWindows(realtimeLimits.topicBroadcastsPerSecond, 1000, now)

  /** Sends a broadcast to the topic's members, whatever the rate, but not to `from` unless it hears its own. */
  const deliver = (publication: Publication, from?: BroadcastMember) => {
    for (const member of topicsOf(publication.private).get(publication.topic) ?? []) {
      if (member !== from || member.self) member.receive(publication.event, publication.payload, publication.meta)
    }
  }

  return {
    /** Puts the member on the topic until the returned function takes it off. */
    join: (topic: string, member: BroadcastMember) => {
      const topics = topicsOf(member.private)
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
      deliver({ topic, event, payload, private: from.private }, from)
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
      for (const publication of publications) deliver(publication)
      return true
    },
    deliver,
  }
}

/**
 * A broadcast sent without a channel, such as over `POST /api/broadcast` or from the database, to the private or the
 * public channels.
 */
export type Publication = {
  topic: string
  event: string
  payload: unknown
  private: boolean
  meta?: BroadcastMeta
}

/** What the socket, the broadcast API and the database send broadcasts through: `broadcastHub`, or `relayedHubs`'. */
export type BroadcastHub = {
  join: (topic: string, member: BroadcastMember) => () => void
  send: (topic: string, from: BroadcastMember, event: string, payload: unknown) => boolean | Promise<boolean>
  publish: (publications: readonly Publication[]) => boolean | Promise<boolean>
}
