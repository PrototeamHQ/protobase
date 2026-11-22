import { describe, expect, it } from 'vitest'
import { typingTransport } from './conversation-typing'

describe('typingTransport', () => {
  it("carries typing over the relay when the app has one, and else over the record's own channel", () => {
    expect(typingTransport(true, true, 'u1')).toBe('relay')
    expect(typingTransport(true, false, 'u1')).toBe('record')
  })

  it('carries nothing without typing or for a visitor', () => {
    expect(typingTransport(undefined, true, 'u1')).toBeUndefined()
    expect(typingTransport(false, false, 'u1')).toBeUndefined()
    expect(typingTransport(true, false, undefined)).toBeUndefined()
  })
})
