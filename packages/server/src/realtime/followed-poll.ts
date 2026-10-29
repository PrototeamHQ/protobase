/**
 * Runs `read` every `intervalMs` while anyone follows, starting at once with the first follower; a failed read goes to
 * `report`, and the next one tries again.
 */
export const followedPoll = (read: () => Promise<void>, intervalMs: number, report: (error: unknown) => void) => {
  let followers = 0
  let running = false

  const tick = async () => {
    if (followers === 0) {
      running = false
      return
    }
    await read().catch(report)
    setTimeout(() => void tick(), intervalMs)
  }

  return {
    /** Reads from now on, until the returned function is called; once for each call, however often. */
    follow: () => {
      followers += 1
      if (!running) {
        running = true
        void tick()
      }
      let followed = true
      return () => {
        if (!followed) return
        followed = false
        followers -= 1
      }
    },
  }
}
