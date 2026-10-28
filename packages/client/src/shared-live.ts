import type { LiveHandlers } from './live'

/**
 * `client.live` for every caller of one client on one stream: the first caller opens it, each hears every event, and
 * the last to stop closes it. A page with many live views then holds one connection however many there are, which a
 * browser's six per host under HTTP/1.1 need.
 */
export const sharedLive = (follow: (handlers: LiveHandlers) => () => void) => {
  const subscribers = new Set<LiveHandlers>()
  let stop: (() => void) | undefined
  const each = (call: (handlers: LiveHandlers) => void) => {
    for (const handlers of [...subscribers]) call(handlers)
  }
  return (handlers: LiveHandlers) => {
    // Its own object, so a caller that passes the same handlers twice is two subscribers.
    const subscriber = { ...handlers }
    subscribers.add(subscriber)
    stop ??= follow({
      onChanges: (changes) => each((one) => one.onChanges(changes)),
      onResync: () => each((one) => one.onResync()),
      onRetry: (error) => each((one) => one.onRetry?.(error)),
    })
    return () => {
      if (!subscribers.delete(subscriber) || subscribers.size > 0) return
      stop?.()
      stop = undefined
    }
  }
}
