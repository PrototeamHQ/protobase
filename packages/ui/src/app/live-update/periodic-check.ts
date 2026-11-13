/** How often the app checks for a release while it is open and signed in. */
export const liveUpdateCheckIntervalMs = 15 * 60_000

/** Checks at once, then every `liveUpdateCheckIntervalMs` while the page is in view; returns what stops it. */
export const checkPeriodically = (check: () => void, inView: () => boolean) => {
  check()
  const timer = setInterval(() => {
    if (inView()) check()
  }, liveUpdateCheckIntervalMs)
  return () => clearInterval(timer)
}
