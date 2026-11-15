import { Ajv } from 'ajv'
import type { JsonSchema } from '../plugin/context'
import type { TaskAnswer } from '../run/port'

/** What a runner sends as it completes a custom step's job: the step's output, or the error it failed with and why. */
export type JobCompletion = { output: unknown } | { error: string; cause?: string }

/** The parts of a custom step's version that its completion is checked against. */
export type CompletedVersion = { output: JsonSchema; error_prefix: string; errors: Record<string, string> }

/** The errors a custom step fails with that its manifest does not name: an output its schema refuses, and any other failure. */
export const jobErrors = { invalidOutput: 'Custom.InvalidOutput', failed: 'Custom.Failed' } as const

/**
 * The answer a custom step's Task takes from its runner's completion: its output, once it fits the version's output
 * schema, else `Custom.InvalidOutput` with what does not fit; a failure under `<error_prefix>.<Name>` when the runner
 * names one of the version's errors, by its name or in full, else `Custom.Failed`, with the name it gave in the cause.
 */
export const jobAnswer = (version: CompletedVersion, completion: JobCompletion): TaskAnswer => {
  if ('output' in completion) {
    // A fresh Ajv, which goes with the check: it keeps what it compiles for its own life.
    const ajv = new Ajv({ strict: false, allErrors: true })
    const valid = ajv.compile(version.output)
    if (valid(completion.output)) return { kind: 'success', output: JSON.stringify(completion.output) }
    return { kind: 'failure', error: jobErrors.invalidOutput, cause: `The output does not fit the step's output schema: ${ajv.errorsText(valid.errors, { dataVar: 'output' })}` }
  }
  const { error, cause = '' } = completion
  const prefix = `${version.error_prefix}.`
  const name = error.startsWith(prefix) ? error.slice(prefix.length) : error
  if (Object.hasOwn(version.errors, name)) return { kind: 'failure', error: `${prefix}${name}`, cause }
  return { kind: 'failure', error: jobErrors.failed, cause: error === '' ? cause : `${error}${cause === '' ? '' : `: ${cause}`}` }
}
