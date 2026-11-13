/** How long the app must have been away before coming back reloads it into a downloaded release. */
export const applyAfterAwayMs = 5 * 60_000

/**
 * How long the app was away: `leave()` when it goes to the background, `back()` when it returns, which gives the time
 * since, or 0 when it never left. Wall-clock time, which goes on while the app is suspended.
 */
export const createAwayClock = (now: () => number = Date.now) => {
  let leftAt: number | undefined
  return {
    leave: () => {
      leftAt = now()
    },
    back: () => {
      const away = leftAt === undefined ? 0 : now() - leftAt
      leftAt = undefined
      return away
    },
  }
}
