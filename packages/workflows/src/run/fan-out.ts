import type { Paused, ScopeOutcome } from './context'

/** How a Map's items or a Parallel's branches ended in this segment: all with their outputs in order, or not. */
export type FanOutOutcome = { kind: 'ended'; outputs: unknown[] } | { kind: 'failed'; error: string; cause: string } | Paused

/**
 * Runs the scopes, at most `concurrency` at once. Once one fails, or the segment's time is up, no more start and the
 * running ones settle; one that waits leaves the others running, and the whole waits for the earliest time.
 */
export const fanOut = async (scopes: readonly (() => Promise<ScopeOutcome>)[], concurrency: number): Promise<FanOutOutcome> => {
  const outcomes: ScopeOutcome[] = new Array(scopes.length)
  let next = 0
  let stop = false
  const lane = async () => {
    while (!stop && next < scopes.length) {
      const index = next++
      const outcome = await scopes[index]!()
      outcomes[index] = outcome
      if (outcome.kind === 'failed' || outcome.kind === 'yielded') stop = true
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, scopes.length) }, lane))
  const settled = outcomes.filter(Boolean)
  const failed = settled.find((outcome) => outcome.kind === 'failed')
  if (failed) return failed
  if (settled.some((outcome) => outcome.kind === 'yielded') || settled.length < scopes.length) return { kind: 'yielded' }
  const waits = settled.flatMap((outcome) => (outcome.kind === 'blocked' ? [outcome.until.getTime()] : []))
  if (waits.length > 0) return { kind: 'blocked', until: new Date(Math.min(...waits)) }
  return { kind: 'ended', outputs: settled.map((outcome) => (outcome as Extract<ScopeOutcome, { kind: 'ended' }>).output) }
}
