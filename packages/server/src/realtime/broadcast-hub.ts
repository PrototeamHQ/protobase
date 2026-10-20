/** A joined channel as a broadcast hears it: whether it hears its own, and where they go. */
export type BroadcastMember = {
  self: boolean
  receive: (event: string, payload: unknown) => void
}

/**
 * The channels of a process by topic, which hear each other's broadcasts in-process: a cloud app runs as one process,
 * so channels of other processes are not reached.
 */
export const broadcastHub = () => {
  const topics = new Map<string, Set<BroadcastMember>>()

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
    /** Sends a broadcast to the topic's members, the sender only when it hears its own. */
    send: (topic: string, from: BroadcastMember, event: string, payload: unknown) => {
      for (const member of topics.get(topic) ?? []) {
        if (member !== from || member.self) member.receive(event, payload)
      }
    },
  }
}

export type BroadcastHub = ReturnType<typeof broadcastHub>
