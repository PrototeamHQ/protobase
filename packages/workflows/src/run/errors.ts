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

// What no retrier or catcher takes, named or by `States.ALL`: a run that broke a limit of the runner stops, as every
// limit fails closed.
const terminal = new Set(['States.Runtime', 'States.DataLimitExceeded'])

/** Whether `ErrorEquals` names the error, or `States.ALL` does, for an error that does not end the run. */
export const matches = (names: readonly string[], error: string) => !terminal.has(error) && (names.includes(error) || names.includes('States.ALL'))

/** Thrown when another segment saved a step first: this one stops, since the run went on without it. */
export class SupersededError extends Error {
  override name = 'SupersededError'
}
