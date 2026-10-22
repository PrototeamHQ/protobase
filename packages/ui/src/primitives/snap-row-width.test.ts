import { describe, expect, it } from 'vitest'
import { snapItemWidth } from './snap-row-width'

describe('snapItemWidth', () => {
  it('takes the gaps off, so a share of a third fits three items and two gaps', () => {
    expect(snapItemWidth(1 / 2)).toBe('calc((100% + 0.75rem) * 0.5 - 0.75rem)')
    expect(snapItemWidth(1)).toBe('calc((100% + 0.75rem) * 1 - 0.75rem)')
  })

  it('refuses a share no row has', () => {
    expect(() => snapItemWidth(0)).toThrow('above 0 and at most 1, not 0')
    expect(() => snapItemWidth(1.5)).toThrow('not 1.5')
  })
})
