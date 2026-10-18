import { describe, expect, it } from 'vitest'
import { cutOffNote } from './cut-off-note'

describe('cutOffNote', () => {
  it('says nothing when every record is shown', () => {
    expect(cutOffNote(10, 10, false)).toBeUndefined()
    expect(cutOffNote(3, 2, false)).toBeUndefined()
  })

  it('says how many are shown of how many', () => {
    expect(cutOffNote(10, 37, false)).toBe('The first 10 of 37.')
  })

  it('says an estimated total is about that many', () => {
    expect(cutOffNote(10, 12345, true)).toBe('The first 10 of about 12,345.')
  })
})
