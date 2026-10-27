import type { PresenceDiff, PresenceMeta, PresenceState } from '../presence-hub'
import type { TrackedPresence } from './relay-presence-sql'

type Entry = { key: string; meta: PresenceMeta }

const topicKey = (topic: string, isPrivate: boolean) => `${isPrivate ? 'private' : 'public'}:${topic}`

/**
 * The other processes' presences by topic and ref, as frames tell them: what `presence_state` adds to this process's
 * own. It holds what they track now, so it is bounded by the presences of the app.
 */
export const presenceReplica = () => {
  let topics = new Map<string, Map<string, Entry>>()

  const add = (topic: string, isPrivate: boolean, key: string, meta: PresenceMeta) => {
    const name = topicKey(topic, isPrivate)
    const refs = topics.get(name) ?? new Map<string, Entry>()
    if (refs.has(meta.phx_ref)) return false
    topics.set(name, refs.set(meta.phx_ref, { key, meta }))
    return true
  }

  const remove = (topic: string, isPrivate: boolean, ref: string) => {
    const name = topicKey(topic, isPrivate)
    const refs = topics.get(name)
    if (!refs?.delete(ref)) return false
    if (refs.size === 0) topics.delete(name)
    return true
  }

  // Each key's metas for which `keep` holds; `undefined` when none does.
  const filtered = (state: PresenceState, keep: (key: string, meta: PresenceMeta) => boolean) => {
    const kept: PresenceState = Object.create(null)
    for (const [key, { metas }] of Object.entries(state)) {
      const left = metas.filter((meta) => keep(key, meta))
      if (left.length > 0) kept[key] = { metas: left }
    }
    return Object.keys(kept).length > 0 ? kept : undefined
  }

  return {
    /** Starts over from the presences a snapshot read. */
    load: (tracked: readonly TrackedPresence[]) => {
      topics = new Map()
      for (const presence of tracked) add(presence.topic, presence.private, presence.key, presence.meta)
    },
    /**
     * Takes a frame's diff, and returns what it changed: the leaves of presences that were there and the joins of those
     * that were not, so a frame read twice tells nothing twice; `undefined` when it changed nothing.
     */
    apply: (topic: string, isPrivate: boolean, diff: PresenceDiff): PresenceDiff | undefined => {
      const leaves = filtered(diff.leaves, (_key, meta) => remove(topic, isPrivate, meta.phx_ref))
      const joins = filtered(diff.joins, (key, meta) => add(topic, isPrivate, key, meta))
      if (!leaves && !joins) return undefined
      return { joins: joins ?? {}, leaves: leaves ?? {} }
    },
    state: (topic: string, isPrivate: boolean) => [...(topics.get(topicKey(topic, isPrivate))?.values() ?? [])].map(({ key, meta }) => [key, meta] as const),
  }
}
