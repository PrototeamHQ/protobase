import { describe, expect, it } from 'vitest'
import { ofDocument } from './document-state'

describe('ofDocument', () => {
  it('keeps a value within its document and starts again in another', () => {
    const shownAgain = { nonce: 'first', value: 2 }
    expect(ofDocument(shownAgain, 'first', 0)).toBe(2)
    expect(ofDocument(shownAgain, 'second', 0)).toBe(0)
    expect(ofDocument(undefined, 'first', 0)).toBe(0)
  })
})
