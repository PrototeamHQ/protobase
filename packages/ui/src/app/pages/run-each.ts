/** What a run over several records does with one: runs on it, skips it as one it does not apply to, or refuses it as one the person may not change. */
export type EachVerdict = 'run' | 'skip' | 'refuse'

/**
 * How a run over several records went: how many it ran on, skipped as not applying and failed on, with the first
 * failure, and the records it refused, before running or because the run was refused.
 */
export type EachOutcome<T> = { done: number; skipped: number; failed: number; refused: T[]; error?: unknown }

/**
 * Runs `run` on each of `records` its `verdict` runs, one after another, so a failure on one leaves the others to run:
 * a failure `refusal` says is a refusal joins the refused records, any other is counted and the first kept for the
 * caller to show.
 */
export const runEach = async <T>(records: T[], verdict: (record: T) => EachVerdict, run: (record: T) => Promise<void>, refusal: (error: unknown) => boolean): Promise<EachOutcome<T>> => {
  const verdicts = records.map((record) => ({ record, verdict: verdict(record) }))
  const outcome: EachOutcome<T> = {
    done: 0,
    skipped: verdicts.filter((entry) => entry.verdict === 'skip').length,
    failed: 0,
    refused: verdicts.flatMap((entry) => (entry.verdict === 'refuse' ? [entry.record] : [])),
  }
  for (const { record } of verdicts.filter((entry) => entry.verdict === 'run')) {
    const failure = await run(record).then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    if (!failure) outcome.done += 1
    else if (refusal(failure.error)) outcome.refused.push(record)
    else {
      outcome.failed += 1
      if (outcome.failed === 1) outcome.error = failure.error
    }
  }
  return outcome
}
