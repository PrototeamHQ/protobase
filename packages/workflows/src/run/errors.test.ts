import { describe, expect, it } from 'vitest'
import { errorOutput, StepError } from './errors'

describe('errorOutput', () => {
  it("names a StepError of another copy of the package by its error, and any other error as States.TaskFailed", () => {
    // A StepError as a second copy of the package defines it: another class, with the same brand.
    const brand: unique symbol = Symbol.for('protobase.workflows.StepError') as never
    class OtherStepError extends Error {
      [brand] = true
      error = 'Acme.Bad'
      reason = 'r'
    }
    expect(new OtherStepError() instanceof StepError).toBe(true)
    expect(errorOutput(new OtherStepError())).toEqual({ Error: 'Acme.Bad', Cause: 'r' })
    expect(errorOutput(new StepError('Http.Status', 'host answered 502'))).toEqual({ Error: 'Http.Status', Cause: 'host answered 502' })
    expect(errorOutput(new Error('boom'))).toEqual({ Error: 'States.TaskFailed', Cause: 'boom' })
  })
})
