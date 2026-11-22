/**
 * The event a conversation's typing goes as, on the record's channel, the relay's or the app's own, with
 * `{ typing: boolean, thread }`: `thread` the key of the thread's first message typed in, or null outside threads.
 */
export const typingEvent = 'typing'

/** A typer sends that they type at most this often, and a page shows them typing this long after the last. */
export const typingSendGapMs = 3_000
export const typingShownMs = 6_000

/** What a box sends as its person types or stops: in the thread of that first message's key, or outside threads. */
export type TypingPayload = { typing: boolean; thread: string | number | null }

/**
 * Where on a channel someone types: the channel itself outside threads, `<channel>?thread=<key>` in a thread, so the
 * conversation's box and each thread's panel show only their own typers.
 */
export const typingSpot = (channel: string, thread: string | number | null) => (thread === null ? channel : `${channel}?thread=${thread}`)

/** Who types where: by spot (`typingSpot`), the user ids and until when they show. */
export type Typers = ReadonlyMap<string, ReadonlyMap<string, number>>

// The payload's typing and thread; undefined for a payload that is no typing, and a typing without a thread, as an
// older sender sends, outside threads.
const typingOf = (payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) return
  const { typing, thread } = payload as Record<string, unknown>
  if (typeof typing !== 'boolean') return
  if (thread === undefined || thread === null) return { typing, thread: null }
  if (typeof thread !== 'string' && typeof thread !== 'number') return
  return { typing, thread }
}

/**
 * The typers once `user` sent `payload` on the channel: typing in its spot until `typingShownMs` from now, or no longer
 * when it says they stopped. A payload that is no typing changes nothing.
 */
export const heardTyping = (typers: Typers, channel: string, user: string, payload: unknown, now: number): Typers => {
  const heard = typingOf(payload)
  if (!heard) return typers
  const spot = typingSpot(channel, heard.thread)
  const typing = new Map(typers.get(spot))
  if (heard.typing) typing.set(user, now + typingShownMs)
  else typing.delete(user)
  const next = new Map(typers)
  if (typing.size > 0) next.set(spot, typing)
  else next.delete(spot)
  return next
}

/** The typers still typing at `now`, the same object when none ran out. */
export const withoutExpired = (typers: Typers, now: number): Typers => {
  if (![...typers.values()].some((spot) => [...spot.values()].some((until) => until <= now))) return typers
  const next = new Map<string, ReadonlyMap<string, number>>()
  for (const [name, spot] of typers) {
    const left = new Map([...spot].filter(([, until]) => until > now))
    if (left.size > 0) next.set(name, left)
  }
  return next
}

/** When the next typer stops showing, to draw them again then; undefined for none. */
export const nextExpiry = (typers: Typers) => {
  const times = [...typers.values()].flatMap((spot) => [...spot.values()])
  return times.length === 0 ? undefined : Math.min(...times)
}

/** Who else types in the spot, leaving out `me`, whose own other devices type there too. */
export const typersOn = (typers: Typers, spot: string, me: string | undefined) => [...(typers.get(spot)?.keys() ?? [])].filter((user) => user !== me)

/** The clock a sender waits on, so a test can stand in for it; `setTimer` answers the function that cancels it. */
export type Clock = { now: () => number; setTimer: (run: () => void, ms: number) => () => void }

/**
 * What a box sends as its text changes: that its person types, at most once every `typingSendGapMs`, a change within a
 * gap told once it has passed, and that they stopped, once, when they empty the box or send. `send` answers whether it
 * could, such as not while the channel is down: one it could not counts as not sent, so the next change tries again.
 * `dispose` cancels a send still waiting.
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
