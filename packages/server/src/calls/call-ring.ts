/** Whom a call rings when a join starts it, and what the ring says. */
export type CallRingInput = {
  /** The users rung, by their ids, such as the record's other members; the member who starts the call is not. */
  users: readonly string[]
  /** What the ring and the bell say, such as "Ann is calling". */
  title: string
  body?: string
  /** Where the bell's entry leads, an absolute URL; the record's page by default. */
  url?: string
}

/** The most users one call rings. */
export const maxRung = 50

/** The ring as given, or an error naming what is wrong with it. */
export const checkRing = (ring: CallRingInput) => {
  if (!Array.isArray(ring.users) || ring.users.length > maxRung || !ring.users.every((user) => typeof user === 'string' && user.length > 0)) {
    throw new TypeError(`calls.join's ring.users must be a list of at most ${maxRung} user ids, each a non-empty string`)
  }
  if (typeof ring.title !== 'string' || ring.title.length === 0) throw new TypeError("calls.join's ring.title must be a non-empty string")
  return ring
}
