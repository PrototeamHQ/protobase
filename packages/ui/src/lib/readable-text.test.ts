import { describe, expect, it } from 'vitest'
import { readableOn } from './readable-text'

describe('readableOn', () => {
  it('sets white text on dark and saturated colours', () => {
    expect(readableOn('#000')).toBe('#ffffff')
    expect(readableOn('#00843d')).toBe('#ffffff')
    expect(readableOn('#e30613')).toBe('#ffffff')
  })

  it('sets near black text on light colours', () => {
    expect(readableOn('#fff')).toBe('#111827')
    expect(readableOn('#FFF200')).toBe('#111827')
    expect(readableOn('#bed630')).toBe('#111827')
  })
})
