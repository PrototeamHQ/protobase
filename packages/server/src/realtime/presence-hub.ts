/** A tracked presence's payload, with the ref Phoenix Presence tells it by and, after an update, the ref it replaced. */
export type PresenceMeta = Record<string, unknown> & { phx_ref: string; phx_ref_prev?: string }

/** Phoenix Presence's state: each key's presences, as `presence_state` sends it and realtime-js reads it. */
export type PresenceState = Record<string, { metas: PresenceMeta[] }>

/** Phoenix Presence's `presence_diff`: the presences that joined and left, by key. */
export type PresenceDiff = { joins: PresenceState; leaves: PresenceState }

/** A joined channel as presence knows it: the key it tracks under, whether it joined private, whether it hears the diffs, and where they go. */
export type PresenceMember = {
  key: string
  private: boolean
  listens: boolean
  receive: (diff: PresenceDiff) => void
}

// Without a prototype, so a key such as `__proto__`, which the client chooses, is a key like any other.
const stateOf = (tracked: readonly (readonly [string, PresenceMeta])[]): PresenceState => {
  const state: PresenceState = Object.create(null)
  for (const [key, meta] of tracked) (state[key] ??= { metas: [] }).metas.push(meta)
  return state
}

/**
 * The presences of a process by topic, in-process like broadcasts: each joined channel tracks at most one, under its
 * key, and channels that listen hear every join and leave on their topic, their own included, as Phoenix Presence
 * sends them. Tracking again replaces the presence: a leave of the old one and a join of the new. Refs count up, unique
 * in the process. Private and public channels of a topic do not see each other, as with broadcasts.
 */
export const presenceHub = () => {
  const publicTopics = new Map<string, Map<PresenceMember, PresenceMeta | undefined>>()
  const privateTopics = new Map<string, Map<PresenceMember, PresenceMeta | undefined>>()
  let lastRef = 0

  const tell = (members: Map<PresenceMember, PresenceMeta | undefined>, diff: PresenceDiff) => {
    for (const member of members.keys()) if (member.listens) member.receive(diff)
  }

  return {
    /** Puts the member on the topic, with what it may do there until it leaves. */
    join: (topic: string, member: PresenceMember) => {
      const topics = member.private ? privateTopics : publicTopics
      const members = topics.get(topic) ?? new Map<PresenceMember, PresenceMeta | undefined>()
      topics.set(topic, members.set(member, undefined))

      const untrack = () => {
        const old = members.get(member)
        if (!old) return
        members.set(member, undefined)
        tell(members, { joins: {}, leaves: stateOf([[member.key, old]]) })
      }

      return {
        /** The topic's presences now, for `presence_state`. */
        state: () => stateOf([...members].flatMap(([{ key }, meta]) => (meta ? [[key, meta] as const] : []))),
        track: (payload: Record<string, unknown>) => {
          const old = members.get(member)
          const meta: PresenceMeta = { ...payload, phx_ref: String(++lastRef), ...(old && { phx_ref_prev: old.phx_ref }) }
          members.set(member, meta)
          tell(members, { joins: stateOf([[member.key, meta]]), leaves: old ? stateOf([[member.key, old]]) : {} })
        },
        untrack,
        leave: () => {
          untrack()
          members.delete(member)
          if (members.size === 0 && topics.get(topic) === members) topics.delete(topic)
        },
      }
    },
  }
}

export type PresenceHub = ReturnType<typeof presenceHub>
export type PresenceSeat = ReturnType<PresenceHub['join']>
