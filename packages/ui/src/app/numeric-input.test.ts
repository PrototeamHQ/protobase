import { describe, expect, it } from 'vitest'
import { numericInputProps } from './numeric-input'

describe('numericInputProps', () => {
  it('brings up a number pad for whole numbers', () => {
    expect(numericInputProps('integer')).toEqual({ inputMode: 'numeric', enterKeyHint: 'done' })
    expect(numericInputProps('bigint')).toEqual({ inputMode: 'numeric', enterKeyHint: 'done' })
  })

  it('brings up a decimal pad for decimals', () => {
    expect(numericInputProps('decimal')).toEqual({ inputMode: 'decimal', enterKeyHint: 'done' })
  })

  it('leaves other fields on the default keyboard', () => {
    for (const type of ['text', 'date', 'currency', 'enum'] as const) expect(numericInputProps(type)).toEqual({})
  })
})
