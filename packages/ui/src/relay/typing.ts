import type { RelayEvent } from '@protobase/client'

/** The event a conversation's typing goes as, on the record's relay channel, with `{ typing: boolean }`. */
export const typingEvent = 'typing'

/** A typer sends that they type at most this often, and a page shows them typing this long after the last. */
export const typingSendGapMs = 3_000
export const typingShownMs = 6_000

/** Who types on which channel: by channel, the user ids and until when they show. */
export type Typers = ReadonlyMap<string, ReadonlyMap<string, number>>

/**
 * The typers once `event` arrived: its sender typing on its channel until `typingShownMs` from now, or no longer when it
 * says they stopped. Anything else, such as a direct event or another event, changes nothing.
 */
export const heardTyping = (typers: Typers, event: RelayEvent, now: number): Typers => {
  if (event.event !== typingEvent || event.channel === undefined || typeof event.payload.typing !== 'boolean') return typers
  const channel = new Map(typers.get(event.channel))
  if (event.payload.typing) channel.set(event.from.user, now + typingShownMs)
  else channel.delete(event.from.user)
  const next = new Map(typers)
  if (channel.size > 0) next.set(event.channel, channel)
  else next.delete(event.channel)
  return next
}

/** The typers still typing at `now`, the same object when none ran out. */
export const withoutExpired = (typers: Typers, now: number): Typers => {
  if (![...typers.values()].some((channel) => [...channel.values()].some((until) => until <= now))) return typers
  const next = new Map<string, ReadonlyMap<string, number>>()
  for (const [name, channel] of typers) {
    const left = new Map([...channel].filter(([, until]) => until > now))
    if (left.size > 0) next.set(name, left)
  }
  return next
}

/** When the next typer stops showing, to draw them again then; undefined for none. */
export const nextExpiry = (typers: Typers) => {
  const times = [...typers.values()].flatMap((channel) => [...channel.values()])
  return times.length === 0 ? undefined : Math.min(...times)
}

/** Who else types on the channel, leaving out `me`, whose own other devices type there too. */
export const typersOn = (typers: Typers, channel: string, me: string | undefined) => [...(typers.get(channel)?.keys() ?? [])].filter((user) => user !== me)

/** The clock a sender waits on, so a test can stand in for it; `setTimer` answers the function that cancels it. */
export type Clock = { now: () => number; setTimer: (run: () => void, ms: number) => () => void }

/**
 * What a composer sends as its text changes: that its person types, at most once every `typingSendGapMs`, a change
 * within a gap told once it has passed, and that they stopped, once, when they empty the box or send. `send` answers
 * whether it could, such as not while the relay is down: one it could not counts as not sent, so the next change tries
 * again. `dispose` cancels a send still waiting.
 */
export const typingSender = (send: (typing: boolean) => boolean, clock: Clock) => {
  let sentAt = -Infinity
  let typing = false
  let cancel: (() => void) | undefined

  const announce = () => {
    cancel = undefined
    if (!send(true)) return
    sentAt = clock.now()
    typing = true
  }
  const dispose = () => {
    cancel?.()
    cancel = undefined
  }
  const stop = () => {
    dispose()
    if (!typing) return
    typing = false
    send(false)
  }
  const onText = (text: string) => {
    if (text.trim() === '') return stop()
    if (cancel) return
    const wait = sentAt + typingSendGapMs - clock.now()
    if (wait <= 0) return announce()
    cancel = clock.setTimer(announce, wait)
  }
  return { onText, onSent: stop, dispose }
}
