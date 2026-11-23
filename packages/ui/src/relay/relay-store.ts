import type { RelayHandlers, RelayNotice } from '@protobase/client'

/** An event the app published on a channel, as `onPublished` hears it. */
type Published = Parameters<NonNullable<RelayHandlers['onPublished']>>[0]
import { typingEvent } from '../typing/typing'
import { createTypersStore } from '../typing/typers-store'

/** How many of the page's own sent messages the store remembers, so the unread count leaves them out. */
const ownKept = 50

/**
 * What the page heard from the relay, for the places that show it: who types on which channel, kept until their typing
 * runs out, and the notices and reconnects, handed to whoever listens. `handlers` follows the relay; `stop` ends it.
 */
export const createRelayStore = () => {
  const typers = createTypersStore()
  const noticeListeners = new Set<(notice: RelayNotice) => void>()
  const resyncListeners = new Set<() => void>()
  const joinedListeners = new Set<(channel: string) => void>()
  const publishedListeners = new Set<(published: Published) => void>()
  const own: string[] = []
  const viewed = new Map<string, number>()
  const viewListeners = new Set<(channel: string) => void>()

  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => void set.delete(listener)
  }

  const handlers: RelayHandlers = {
    // A direct event, or another event, is no typing on a channel.
    onEvent: (event) => {
      if (event.event === typingEvent && event.channel !== undefined) typers.heard(event.channel, event.from.user, event.payload)
    },
    onNotice: (notice) => {
      for (const listener of [...noticeListeners]) listener(notice)
    },
    // Typing cannot be known while the relay is down: nobody shows as typing then.
    onStatus: (status) => {
      if (status !== 'open') typers.clear()
    },
    onResync: () => {
      typers.clear()
      for (const listener of [...resyncListeners]) listener()
    },
    onJoined: (channel) => {
      for (const listener of [...joinedListeners]) listener(channel)
    },
    onPublished: (published) => {
      for (const listener of [...publishedListeners]) listener(published)
    },
  }

  return {
    typers: typers.typers,
    subscribe: typers.subscribe,
    onNotice: (listener: (notice: RelayNotice) => void) => listen(noticeListeners, listener),
    onResync: (listener: () => void) => listen(resyncListeners, listener),
    /** Hears of each channel the person was added to after the page connected, such as a new direct message, once joined. */
    onJoined: (listener: (channel: string) => void) => listen(joinedListeners, listener),
    /** Hears each other event the app publishes on a channel, such as a person's new presence on `people`. */
    onPublished: (listener: (published: Published) => void) => listen(publishedListeners, listener),
    /** Remembers a message the page itself sent, by key, which no unread count takes; only the latest few. */
    sent: (key: string) => {
      own.push(key)
      if (own.length > ownKept) own.shift()
    },
    own: () => new Set(own),
    /** Says the page shows the channel's records, such as an open conversation, until the returned function is called. */
    view: (channel: string) => {
      viewed.set(channel, (viewed.get(channel) ?? 0) + 1)
      for (const listener of [...viewListeners]) listener(channel)
      return () => {
        const left = (viewed.get(channel) ?? 1) - 1
        if (left > 0) viewed.set(channel, left)
        else viewed.delete(channel)
      }
    },
    /** Whether the page shows the channel now. */
    viewing: (channel: string) => viewed.has(channel),
    /** Hears of each channel the page starts to show. */
    onView: (listener: (channel: string) => void) => listen(viewListeners, listener),
    /**
     * Whether the page shows what the notice changed: a record of a channel resource itself, such as a renamed
     * conversation, always; another only on a channel the page views, or on any while it views none, such as a list.
     */
    shows: (notice: RelayNotice) => viewed.size === 0 || viewed.has(notice.channel) || notice.channel === `${notice.resource}/${notice.key}`,
    handlers,
    stop: typers.stop,
  }
}

export type RelayStore = ReturnType<typeof createRelayStore>
