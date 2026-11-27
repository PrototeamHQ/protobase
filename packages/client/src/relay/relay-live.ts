import { peopleEvents, ringNotice } from '@protobase/schema/internal'
import type { LiveChange, LiveHandlers } from '../live'
import { isApiError } from '../problem'
import { NetworkError } from '../network-error'
import { isLiveEntry, liveChangesOf } from './live-entry'
import { liveTopicPrefix, peopleTopic, type RelayClient } from './relay-client'
import { RelayRefusal } from './relay-types'

/** How often a resource the relay cannot keep live is read again, such as in an app whose relay has no changes service. */
export const pollMs = 30_000

export type RelayLiveOptions = {
  relay: Pick<RelayClient, 'follow' | 'status' | 'joinLive' | 'leaveLive'>
  /** A fresh live token for every record of `resource` the caller may read, or undefined when the read gives none. */
  token: (resource: string) => Promise<string | undefined>
  pollMs?: number
}

export type RelayLiveHandlers = LiveHandlers & {
  /** The `.live()` resources to hear the changes of, each over a live query of its own. */
  resources: readonly string[]
  /** Those only read again every `pollMs`, such as one live from others (`.live({ reads })`), whose own table never changes. */
  polled?: readonly string[]
}

// A resource's live query: how many followers hear it, where it resumes, and the poll while the relay cannot keep it.
type Topic = { resource: string; joins: boolean; followers: number; cursor?: string; poll?: ReturnType<typeof setInterval>; attempt: number }

// What a failed token read leaves to the poll: no answer, or an answer that is no token.
const unreadable = (error: unknown) => {
  if (error instanceof NetworkError || isApiError(error)) return
  throw error
}

/**
 * `client.live` over the app's realtime relay: each resource followed is one live query on the relay's one socket,
 * joined with the live token of a read of every record of it the caller may read, and resumed after the cursor of the
 * last change heard of, when the token expires or the socket joins again. A resource the relay cannot keep live, as
 * when the read gives no token, the app's relay has no changes service or lost it, or the socket is down, is read again
 * every `pollMs` until it can; the page's return to the window reads it again too, as every query does.
 *
 * Followers hear `onResync` once the socket connected again after a drop, or the app said their access changed on
 * `people`: their tokens are read again then. The `rings` the app says changed come as a change of `ringNotice`.
 */
export const relayLive = ({ relay, token, pollMs: every = pollMs }: RelayLiveOptions) => {
  const followers = new Set<RelayLiveHandlers>()
  const topics = new Map<string, Topic>()
  let unfollow: (() => void) | undefined

  const tell = (changes: LiveChange[]) => {
    for (const follower of [...followers]) {
      const theirs = changes.filter((change) => change.resource === ringNotice || follower.resources.includes(change.resource) || follower.polled?.includes(change.resource))
      if (theirs.length > 0) follower.onChanges(theirs)
    }
  }
  // Any record of the resource may have changed: an empty key, as for one live from others.
  const stale = (resource: string) => tell([{ resource, key: '', operation: 'update' }])
  const resync = () => {
    for (const follower of [...followers]) follower.onResync()
  }

  const poll = (topic: Topic) => {
    topic.poll ??= setInterval(() => stale(topic.resource), every)
  }
  const unpoll = (topic: Topic) => {
    clearInterval(topic.poll)
    topic.poll = undefined
  }

  // Joins with a fresh token, after the topic's cursor when it has one; a join from the token's snapshot reads the
  // resource once more, as the page's read came before it. A later join of the same topic wins.
  const join = async (topic: Topic) => {
    const attempt = ++topic.attempt
    const current = () => topics.get(topic.resource) === topic && topic.attempt === attempt
    const live = await token(topic.resource).catch(unreadable)
    if (!current()) return
    if (!live) return poll(topic)
    const fresh = topic.cursor === undefined
    const refusal = await relay.joinLive(`${liveTopicPrefix}${topic.resource}`, { live, ...(topic.cursor !== undefined && { cursor: topic.cursor }) }).then(
      () => undefined,
      (error: unknown) => {
        if (error instanceof RelayRefusal) return error.reason
        throw error
      },
    )
    if (!current()) return
    // The socket dropped meanwhile: it joins again once it is back.
    if (refusal === 'disconnected') return
    if (refusal !== undefined) return poll(topic)
    unpoll(topic)
    if (fresh) stale(topic.resource)
  }
  const joinAll = () => {
    for (const topic of topics.values()) if (topic.joins) void join(topic)
  }

  const hear = ({ topic: name, event, payload }: { topic: string; event: string; payload: Record<string, unknown> }) => {
    const topic = topics.get(name.slice(liveTopicPrefix.length))
    if (!topic) return
    if (event === 'change' && isLiveEntry(payload)) {
      topic.cursor = payload.cursor
      unpoll(topic)
      return tell(liveChangesOf(topic.resource, payload))
    }
    // The changes service dropped: the relay registers the query again once it is back, and its next change ends the poll.
    if (event === 'phx_error') return poll(topic)
    if (event !== 'phx_close') return
    if (payload.reason === 'expired') return void join(topic)
    if (payload.reason === 'revoked') return unpoll(topic)
    // `gap`, `refused` or another end: the changes since the cursor are not all there, so it starts from a new read.
    topic.cursor = undefined
    void join(topic)
  }

  const start = () => {
    unfollow = relay.follow({
      onLive: hear,
      onStatus: (status) => {
        if (status === 'open') return joinAll()
        for (const topic of topics.values()) if (topic.joins) poll(topic)
      },
      // Back after a drop, it may have missed a `refresh` or `rings` on `people`; the reconnect joined again already.
      onResync: resync,
      onPublished: ({ channel, event }) => {
        if (channel !== peopleTopic) return
        if (event === peopleEvents.rings) return tell([{ resource: ringNotice, key: '', operation: 'update' }])
        if (event !== peopleEvents.refresh) return
        joinAll()
        resync()
      },
    })
  }

  const add = (resource: string, joins: boolean) => {
    const known = topics.get(resource)
    if (known) return void known.followers++
    const topic: Topic = { resource, joins, followers: 1, attempt: 0 }
    topics.set(resource, topic)
    if (!joins) return poll(topic)
    if (relay.status() === 'open') void join(topic)
    else poll(topic)
  }
  const remove = (resource: string) => {
    const topic = topics.get(resource)
    if (!topic || --topic.followers > 0) return
    topics.delete(resource)
    unpoll(topic)
    if (topic.joins) relay.leaveLive(`${liveTopicPrefix}${resource}`)
  }

  /** Hears the changes of `resources` until the returned function is called; the first follower opens the relay's socket, the last lets it go. */
  return (handlers: RelayLiveHandlers) => {
    const follower = { ...handlers }
    followers.add(follower)
    if (!unfollow) start()
    for (const resource of follower.resources) add(resource, true)
    for (const resource of follower.polled ?? []) add(resource, false)
    return () => {
      if (!followers.delete(follower)) return
      for (const resource of follower.resources) remove(resource)
      for (const resource of follower.polled ?? []) remove(resource)
      if (followers.size > 0) return
      unfollow?.()
      unfollow = undefined
    }
  }
}
