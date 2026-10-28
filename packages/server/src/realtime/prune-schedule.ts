/** How often a serving process prunes the realtime tables. */
export const realtimePruneIntervalMs = 10 * 60_000

/**
 * Runs each step once now, then every `intervalMs`, never two rounds at once, until `stop`, which waits for a round in
 * progress. A failed step is reported and the steps after it still run; the next round tries it again.
 */
export const pruneSchedule = (steps: readonly (() => Promise<void>)[], report: (error: unknown) => void, intervalMs = realtimePruneIntervalMs) => {
  let stopped = false
  let running: Promise<void> | undefined

  const round = async () => {
    for (const step of steps) await step().catch(report)
  }

  const tick = () => {
    if (stopped || running) return
    running = round().finally(() => {
      running = undefined
    })
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return {
    stop: async () => {
      stopped = true
      clearInterval(timer)
      await running
    },
  }
}

export type PruneSchedule = ReturnType<typeof pruneSchedule>
