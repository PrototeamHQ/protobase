import { describe, expect, it } from 'vitest'
import { valueColor } from './value-color'

describe('valueColor', () => {
  it("finds a value's colour by its text, and none for another value or no colours", () => {
    expect(valueColor({ a: '#00a651', '1': '#ff0000' }, 'a')).toBe('#00a651')
    expect(valueColor({ '1': '#ff0000' }, 1)).toBe('#ff0000')
    expect(valueColor({ a: '#00a651' }, 'constructor')).toBeUndefined()
    expect(valueColor(undefined, 'a')).toBeUndefined()
  })
})
