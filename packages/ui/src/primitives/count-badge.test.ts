import { describe, expect, it } from 'vitest'
import { countBadgeText } from './count-badge'

describe('countBadgeText', () => {
  it('shows up to 99, then 99+, and nothing while the count is zero or unknown', () => {
    expect([undefined, 0, -1, 1, 99, 100, 250].map(countBadgeText)).toEqual([undefined, undefined, undefined, '1', '99', '99+', '99+'])
  })
})
