import { limits, nestingDepth } from '@protobase/workflows'
import { badRequest } from '../problem'
import type { WriteCheck } from '../types'

/**
 * Refuses a run's input over `limits.inputBytes` as JSON or nested deeper than `limits.inputDepth`, before anything
 * evaluates it: a 400 problem, so the run is not created.
 */
export const checkRunInput = (input: unknown) => {
  if (nestingDepth(input, limits.inputDepth) > limits.inputDepth) throw badRequest('input-too-deep', `A run's input nests at most ${limits.inputDepth} levels of arrays and objects`)
  const bytes = new TextEncoder().encode(JSON.stringify(input ?? null)).length
  if (bytes > limits.inputBytes) throw badRequest('input-too-large', `A run's input is at most ${limits.inputBytes / 1024} KiB as JSON; this one is ${bytes} bytes`)
}

/**
 * The same limits on a run's input as the API sent it, before the body is validated, whose walk of a deeply nested
 * value would overflow the call stack; a re-run or a replay takes the input of the run it re-runs, so it is given none,
 * and a replay names the run it replays.
 */
export const runInputCheck: WriteCheck = async ({ resource, operation, body }) => {
  if (resource !== 'workflow_runs' || operation !== 'create' || typeof body !== 'object' || body === null) return
  const { input, rerun_of, replay } = body as { input?: unknown; rerun_of?: unknown; replay?: unknown }
  if (replay === true && rerun_of == null) throw badRequest('replay-without-run', 'A replay replays a run: give the run it replays as rerun_of')
  if (rerun_of != null && input != null) throw badRequest('rerun-input', 'A re-run runs on the input of the run it re-runs: give it no input')
  checkRunInput(input)
}
