/**
 * Runs at most `concurrent` tasks at once, with at most `waiting` more in line; a task beyond those is refused rather
 * than queued, so the work never holds more than `concurrent` of what it uses, such as pooled connections.
 */
export const boundedRunner = (concurrent: number, waiting: number) => {
  let running = 0
  const line: (() => void)[] = []

  const next = () => {
    running -= 1
    line.shift()?.()
  }

  return {
    /** The task's result, or `refused` when the line is full. */
    run: async <T>(task: () => Promise<T>): Promise<{ refused: true } | { refused: false; value: T }> => {
      if (running >= concurrent) {
        if (line.length >= waiting) return { refused: true }
        await new Promise<void>((resolve) => line.push(resolve))
      }
      running += 1
      return task().then(
        (value) => (next(), { refused: false as const, value }),
        (error: unknown) => {
          next()
          throw error
        },
      )
    },
  }
}
