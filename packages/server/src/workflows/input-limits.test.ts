import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { checkRunInput, runInputCheck } from './input-limits'

const nested = (depth: number) => {
  let value: unknown = 1
  for (let level = 0; level < depth; level++) value = [value]
  return value
}

const refusal = (input: unknown) => {
  try {
    checkRunInput(input)
    return undefined
  } catch (error) {
    if (!(error instanceof HttpProblem)) throw error
    return [error.status, error.slug]
  }
}

describe("a run's input limits", () => {
  it('takes 64 levels and 1 MiB, and refuses one level or one byte more with a 400', () => {
    expect(refusal(nested(64))).toBeUndefined()
    expect(refusal(nested(65))).toEqual([400, 'input-too-deep'])
    expect(refusal({ text: 'x'.repeat(1024 * 1024 - 11) })).toBeUndefined()
    expect(refusal({ text: 'x'.repeat(1024 * 1024 - 10) })).toEqual([400, 'input-too-large'])
  })

  it('refuses an input nested 100,000 deep without overflowing the stack', () => {
    expect(refusal(nested(100_000))).toEqual([400, 'input-too-deep'])
  })

  it('refuses a re-run given an input of its own, as it runs on the input of the run it re-runs', async () => {
    const check = (body: object) => runInputCheck({ resource: 'workflow_runs', operation: 'create', body })
    await expect(check({ workflow_id: 'w', rerun_of: 'r', input: { day: 1 } })).rejects.toMatchObject({ status: 400, slug: 'rerun-input' })
    await expect(check({ workflow_id: 'w', rerun_of: 'r', input: null })).resolves.toBeUndefined()
    await expect(check({ workflow_id: 'w', input: { day: 1 } })).resolves.toBeUndefined()
  })
})
