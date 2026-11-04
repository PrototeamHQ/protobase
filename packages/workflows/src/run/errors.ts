/**
 * A step's failure by name, as `Catch` and `Retry` match it in `ErrorEquals`: a step type throws one with its own
 * names (such as `Http.Status`); any other error a step throws counts as `States.TaskFailed`.
 */
export class StepError extends Error {
  override name = 'StepError'
  constructor(readonly error: string, readonly reason: string) {
    super(`${error}: ${reason}`)
  }
}

/** The error and cause a failed step records, which `$states.errorOutput` holds in a catcher. */
export type ErrorOutput = { Error: string; Cause: string }

export const errorOutput = (thrown: unknown): ErrorOutput => {
  if (thrown instanceof StepError) return { Error: thrown.error, Cause: thrown.reason }
  return { Error: 'States.TaskFailed', Cause: thrown instanceof Error ? thrown.message : String(thrown) }
}

// What `States.ALL` does not catch: a run that broke a limit of the runner stops.
const terminal = new Set(['States.Runtime', 'States.DataLimitExceeded'])

/** Whether `ErrorEquals` names the error, or `States.ALL` does and the error is not one that ends the run. */
export const matches = (names: readonly string[], error: string) => names.includes(error) || (names.includes('States.ALL') && !terminal.has(error))

/** Thrown when another segment saved a step first: this one stops, since the run went on without it. */
export class SupersededError extends Error {
  override name = 'SupersededError'
}
