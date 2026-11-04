import type { Paused, ScopeOutcome } from './context'

/** How a Map's items ended in this segment: all with their outputs in order, or not. */
export type FanOutOutcome = { kind: 'ended'; outputs: unknown[] } | { kind: 'failed'; error: string; cause: string } | Paused

/**
 * Runs the scopes, at most `concurrency` at once. Once one fails, throws, or the segment's time is up, no more start and
 * the running ones settle, so none runs on after the segment ends; one that waits leaves the others running, and the
 * whole waits for the earliest time. A scope's error is thrown once all have settled.
 */
export const fanOut = async (scopes: readonly (() => Promise<ScopeOutcome>)[], concurrency: number): Promise<FanOutOutcome> => {
  const outcomes: ScopeOutcome[] = new Array(scopes.length)
  let next = 0
  let stop = false
  const lane = async () => {
    while (!stop && next < scopes.length) {
      const index = next++
      const outcome = await scopes[index]!().catch((error: unknown) => {
        stop = true
        throw error
      })
      outcomes[index] = outcome
      if (outcome.kind === 'failed' || outcome.kind === 'yielded') stop = true
    }
  }
  const lanes = await Promise.allSettled(Array.from({ length: Math.min(concurrency, scopes.length) }, lane))
  const thrown = lanes.find((settled) => settled.status === 'rejected')
  if (thrown) throw thrown.reason
  const settled = outcomes.filter(Boolean)
  const failed = settled.find((outcome) => outcome.kind === 'failed')
  if (failed) return failed
  if (settled.some((outcome) => outcome.kind === 'yielded') || settled.length < scopes.length) return { kind: 'yielded' }
  const waits = settled.flatMap((outcome) => (outcome.kind === 'blocked' ? [outcome.until.getTime()] : []))
  if (waits.length > 0) return { kind: 'blocked', until: new Date(Math.min(...waits)) }
  return { kind: 'ended', outputs: settled.map((outcome) => (outcome as Extract<ScopeOutcome, { kind: 'ended' }>).output) }
}
