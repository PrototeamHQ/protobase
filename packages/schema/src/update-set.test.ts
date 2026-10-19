import { describe, expect, it } from 'vitest'
import { updateSetErrors, updateValues } from './update-set'

describe('updateValues', () => {
  it('writes literals and the typed answers, null for an empty one', () => {
    expect(updateValues({ status: 'answered', answer: '{answer}', count: '{count}' }, { answer: 'Yes', count: null })).toEqual({ status: 'answered', answer: 'Yes', count: null })
  })
  it('leaves out the field of a hidden input', () => {
    expect(updateValues({ status: 'open', answer: '{answer}' }, {})).toEqual({ status: 'open' })
  })
  it('writes text that only contains braces as it is', () => {
    expect(updateValues({ note: 'a {b} c' }, {})).toEqual({ note: 'a {b} c' })
  })
})

describe('updateSetErrors', () => {
  it('flags a placeholder that names no input', () => {
    expect(updateSetErrors({ answer: '{nope}' }, [{ name: 'answer', kind: 'text', label: 'Answer', required: true }])).toEqual(['set "answer" names input "nope", which it does not ask for'])
    expect(updateSetErrors({ answer: '{nope}' })).toHaveLength(1)
  })
  it('accepts literals and named inputs', () => {
    expect(updateSetErrors({ answer: '{answer}', status: 'done' }, [{ name: 'answer', kind: 'text', label: 'Answer', required: true }])).toEqual([])
  })
})
