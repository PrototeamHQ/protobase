import { describe, expect, it } from 'vitest'
import { writesFor } from './writes'

describe('writesFor', () => {
  it('writes unless the type declares it does not', () => {
    expect(writesFor({}, {})).toBe(true)
    expect(writesFor({ writes: true }, {})).toBe(true)
    expect(writesFor({ writes: false }, {})).toBe(false)
  })

  it('asks a function with the input', () => {
    const writes = (input: Record<string, unknown>) => input.method !== 'GET'
    expect(writesFor({ writes }, { method: 'GET' })).toBe(false)
    expect(writesFor({ writes }, { method: 'POST' })).toBe(true)
  })

  it('writes when the function throws or gives anything but false', () => {
    expect(writesFor({ writes: () => { throw new Error('no') } }, {})).toBe(true)
    expect(writesFor({ writes: (() => 'no') as never }, {})).toBe(true)
    expect(writesFor({ writes: (() => undefined) as never }, {})).toBe(true)
    expect(writesFor({ writes: (() => 0) as never }, {})).toBe(true)
  })
})
