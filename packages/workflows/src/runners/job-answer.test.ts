import { describe, expect, it } from 'vitest'
import { jobAnswer, type CompletedVersion } from './job-answer'

const version: CompletedVersion = {
  output: { type: 'object', required: ['pages'], properties: { pages: { type: 'integer' }, pdf: { 'x-file': true } } },
  error_prefix: 'Invoice',
  errors: { Refused: 'the renderer refused the invoice' },
}

describe("the answer a custom step's completion gives its Task", () => {
  it('passes on an output that fits the output schema, as the JSON a success takes', () => {
    expect(jobAnswer(version, { output: { pages: 2 } })).toEqual({ kind: 'success', output: '{"pages":2}' })
  })

  it('fails one that does not fit with Custom.InvalidOutput, saying what does not', () => {
    expect(jobAnswer(version, { output: { pages: 'two' } })).toEqual({ kind: 'failure', error: 'Custom.InvalidOutput', cause: "The output does not fit the step's output schema: output/pages must be integer" })
    expect(jobAnswer(version, { output: null })).toMatchObject({ kind: 'failure', error: 'Custom.InvalidOutput' })
  })

  it("fails with one of the version's errors under its prefix, named bare or in full, and with Custom.Failed for any other", () => {
    expect(jobAnswer(version, { error: 'Refused', cause: 'No VAT number' })).toEqual({ kind: 'failure', error: 'Invoice.Refused', cause: 'No VAT number' })
    expect(jobAnswer(version, { error: 'Invoice.Refused' })).toEqual({ kind: 'failure', error: 'Invoice.Refused', cause: '' })
    expect(jobAnswer(version, { error: 'Crashed', cause: 'exit code 137' })).toEqual({ kind: 'failure', error: 'Custom.Failed', cause: 'Crashed: exit code 137' })
    expect(jobAnswer(version, { error: 'Other.Refused' })).toEqual({ kind: 'failure', error: 'Custom.Failed', cause: 'Other.Refused' })
    expect(jobAnswer(version, { error: '', cause: 'it broke' })).toEqual({ kind: 'failure', error: 'Custom.Failed', cause: 'it broke' })
  })

  it("passes the custom steps' own errors on as a runner names them", () => {
    expect(jobAnswer(version, { error: 'Custom.Failed', cause: 'exit code 2' })).toEqual({ kind: 'failure', error: 'Custom.Failed', cause: 'exit code 2' })
    expect(jobAnswer(version, { error: 'Custom.InvalidOutput', cause: 'output.json is no JSON' })).toEqual({ kind: 'failure', error: 'Custom.InvalidOutput', cause: 'output.json is no JSON' })
  })
})
