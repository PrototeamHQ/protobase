import { describe, expect, it } from 'vitest'
import { trendSummary } from './trend-summary'

describe('trendSummary', () => {
  it('says how many over the range, and none when there are none', () => {
    expect(trendSummary(4, '90d')).toBe('4 in the last 90 days')
    expect(trendSummary(1, '7d')).toBe('1 in the last 7 days')
    expect(trendSummary(1200, '1y')).toBe('1,200 in the last year')
    expect(trendSummary(0, '30d')).toBe('None in the last 30 days')
    expect(trendSummary(34, 'all')).toBe('34 in total')
    expect(trendSummary(0, 'all')).toBe('None yet')
  })
})
