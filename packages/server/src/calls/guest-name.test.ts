import { describe, expect, it } from 'vitest'
import { guestName } from './guest-name'

describe("a guest's name", () => {
  it('is kept as they wrote it, trimmed, markup and all, as text', () => {
    expect(guestName('  Ann Smith ')).toBe('Ann Smith')
    expect(guestName('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
    expect(guestName('Zoë 🎉')).toBe('Zoë 🎉')
  })

  it('is refused empty, too long, or with control or format characters', () => {
    expect(() => guestName('   ')).toThrow('Give a name of 1 to 60 characters')
    expect(() => guestName(undefined)).toThrow('Give a name of 1 to 60 characters')
    expect(() => guestName('a'.repeat(61))).toThrow('Give a name of 1 to 60 characters')
    expect(guestName('🎉'.repeat(60))).toHaveLength(120)
    expect(() => guestName('Ann\u0000')).toThrow('control characters')
    expect(() => guestName('Ann\nBob')).toThrow('control characters')
    expect(() => guestName('Ann‮boB')).toThrow('control characters')
  })
})
