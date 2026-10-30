import { describe, expect, it } from 'vitest'
import { valueColor, valueTone } from './value-color'

describe('valueColor', () => {
  it("finds a value's colour by its text, and none for another value, a tone or no colours", () => {
    expect(valueColor({ a: '#00a651', '1': '#ff0000' }, 'a')).toBe('#00a651')
    expect(valueColor({ '1': '#ff0000' }, 1)).toBe('#ff0000')
    expect(valueColor({ a: '#00a651' }, 'constructor')).toBeUndefined()
    expect(valueColor({ a: 'green' }, 'a')).toBeUndefined()
    expect(valueColor(undefined, 'a')).toBeUndefined()
  })
})

describe('valueTone', () => {
  it("finds a value's declared tone, and neutral for a hex colour, another value or no colours", () => {
    expect(valueTone({ paid: 'green', a: '#00a651' }, 'paid')).toBe('green')
    expect(valueTone({ a: '#00a651' }, 'a')).toBe('neutral')
    expect(valueTone({ paid: 'green' }, 'constructor')).toBe('neutral')
    expect(valueTone(undefined, 'paid')).toBe('neutral')
  })
})
