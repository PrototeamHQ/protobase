import { describe, expect, it } from 'vitest'
import { encrypted } from './encrypted-value'

describe('encrypted', () => {
  it('is set, and never equal to a value', () => {
    expect(encrypted == null).toBe(false)
    expect(!encrypted).toBe(false)
    expect((encrypted as unknown) === 'x').toBe(false)
  })

  it('throws when read as text or compared loosely', () => {
    expect(() => (encrypted as unknown) == 'x').toThrow(TypeError)
    expect(() => `${encrypted as unknown as string}`).toThrow(TypeError)
    expect(() => String(encrypted)).toThrow(TypeError)
  })

  it('is frozen and serializes to nothing', () => {
    expect(Object.isFrozen(encrypted)).toBe(true)
    expect(JSON.stringify({ a: encrypted })).toBe('{"a":{}}')
  })
})
