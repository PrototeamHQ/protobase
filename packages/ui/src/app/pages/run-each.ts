/** How a run over several records went: how many it ran on, skipped as not applying, and failed on, with the first failure. */
export type EachOutcome = { done: number; skipped: number; failed: number; error?: unknown }

/**
 * Runs `run` on each of `records` that `applies` to, one after another, so a failure on one leaves the others to run:
 * it is counted, and the first is kept for the caller to show.
 */
export const runEach = async <T>(records: T[], applies: (record: T) => boolean, run: (record: T) => Promise<void>): Promise<EachOutcome> => {
  const applying = records.filter(applies)
  const outcome: EachOutcome = { done: 0, skipped: records.length - applying.length, failed: 0 }
  for (const record of applying) {
    const failure = await run(record).then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    if (!failure) outcome.done += 1
    else {
      outcome.failed += 1
      if (outcome.failed === 1) outcome.error = failure.error
    }
  }
  return outcome
}
