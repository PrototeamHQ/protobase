import type { RelayHandlers, RelayNotice } from '@protobase/client'
import { heardTyping, nextExpiry, withoutExpired, type Typers } from './typing'

/** How many of the page's own sent messages the store remembers, so the unread count leaves them out. */
const ownKept = 50

/**
 * What the page heard from the relay, for the places that show it: who types on which channel, kept until their typing
 * runs out, and the notices and reconnects, handed to whoever listens. `handlers` follows the relay; `stop` ends it.
 */
export const createRelayStore = () => {
  let typers: Typers = new Map()
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const noticeListeners = new Set<(notice: RelayNotice) => void>()
  const resyncListeners = new Set<() => void>()
  const own: string[] = []
  const viewed = new Map<string, number>()
  const viewListeners = new Set<(channel: string) => void>()

  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => void set.delete(listener)
  }

  // Draws the typers again when the first of them runs out.
  const set = (next: Typers) => {
    if (next === typers) return
    typers = next
    for (const listener of [...listeners]) listener()
    clearTimeout(timer)
    const at = nextExpiry(typers)
    if (at !== undefined) timer = setTimeout(() => set(withoutExpired(typers, Date.now())), Math.max(0, at - Date.now()))
  }

  const handlers: RelayHandlers = {
    onEvent: (event) => set(heardTyping(typers, event, Date.now())),
    onNotice: (notice) => {
      for (const listener of [...noticeListeners]) listener(notice)
    },
    // Typing cannot be known while the relay is down: nobody shows as typing then.
    onStatus: (status) => {
      if (status !== 'open') set(new Map())
    },
    onResync: () => {
      set(new Map())
      for (const listener of [...resyncListeners]) listener()
    },
  }

  return {
    typers: () => typers,
    subscribe: (listener: () => void) => listen(listeners, listener),
    onNotice: (listener: (notice: RelayNotice) => void) => listen(noticeListeners, listener),
    onResync: (listener: () => void) => listen(resyncListeners, listener),
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
    stop: () => clearTimeout(timer),
  }
}

export type RelayStore = ReturnType<typeof createRelayStore>
