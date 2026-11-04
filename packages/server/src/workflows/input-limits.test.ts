import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { checkRunInput } from './input-limits'

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
})
