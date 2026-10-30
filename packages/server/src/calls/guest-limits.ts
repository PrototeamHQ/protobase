/**
 * Counts per key in a fixed window of `windowMs`, which all keys share: every count starts over when it turns, so
 * memory follows the keys of the current window.
 */
export const windowCounts = (windowMs: number, now = () => Date.now()) => {
  let start = -Infinity
  let counts = new Map<string, number>()
  const turn = () => {
    if (now() - start < windowMs) return
    start = now()
    counts = new Map()
  }
  return {
    count: (key: string) => {
      turn()
      return counts.get(key) ?? 0
    },
    add: (key: string) => {
      turn()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    },
  }
}

/** Lobby entries an address makes in a minute at most, as the sign-in routes allow sign-ins by default. */
export const entriesPerMinute = 5
/** Unknown or refused tokens an address sends in a minute before the lobby answers it 429 until the minute turns. */
export const refusalsPerMinute = 10
/** Times a waiting guest asks after their wait in a minute at most: one a second, with room. */
export const pollsPerMinute = 120

/** The lobby's limits, per process: by address, and by guest. */
export const guestLimits = (now = () => Date.now()) => {
  const entries = windowCounts(60_000, now)
  const refusals = windowCounts(60_000, now)
  const polls = windowCounts(60_000, now)
  return {
    /** Whether the address sent too many refused tokens this minute. */
    blocked: (address: string) => refusals.count(address) >= refusalsPerMinute,
    refused: (address: string) => refusals.add(address),
    /** Takes one entry of the address: whether it fits. */
    enter: (address: string) => {
      if (entries.count(address) >= entriesPerMinute) return false
      entries.add(address)
      return true
    },
    /** Takes one ask of the guest: whether it fits. */
    poll: (guest: string) => {
      if (polls.count(guest) >= pollsPerMinute) return false
      polls.add(guest)
      return true
    },
  }
}

export type GuestLimits = ReturnType<typeof guestLimits>
