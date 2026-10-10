/**
 * Runs `run` every `minutes`, never two at once; a failed run is reported and the next one still comes. `stop` ends the
 * timer and waits for a run in progress.
 */
export const startCleanupTimer = (run: () => Promise<unknown>, minutes: number, report: (error: unknown) => void) => {
  let running: Promise<void> | undefined
  const tick = () => {
    if (running) return
    running = run().then(() => undefined, report).finally(() => {
      running = undefined
    })
  }
  const timer = setInterval(tick, minutes * 60_000)
  timer.unref?.()
  return {
    stop: async () => {
      clearInterval(timer)
      await running
    },
  }
}
