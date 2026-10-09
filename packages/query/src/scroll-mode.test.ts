import { describe, expect, it } from 'vitest'
import { ascendingAnchors, descendingAnchors } from './anchor-positions'
import { scrollMode } from './scroll-mode'

describe('scrollMode', () => {
  it.each([
    [0, 'exact'],
    [99_999, 'exact'],
    [100_000, 'statistics'],
    [5_000_000, 'statistics'],
    [5_000_001, 'sampled'],
  ] as const)('%d rows is %s', (rows, mode) => {
    expect(scrollMode(rows)).toBe(mode)
  })
})

describe('anchor positions', () => {
  const stats = { nullFraction: 0, bounds: ['0', '10', '20', '30', '40'], commonValues: [], commonFrequencies: [] }

  it('spreads histogram bounds evenly over the rows', () => {
    expect(ascendingAnchors(stats, 400, 'integer').map(a => a.position)).toEqual([0, 100, 200, 300, 400])
  })

  it('accounts for nulls and most-common values below each bound', () => {
    const skewed = { ...stats, nullFraction: 0.1, commonValues: ['5'], commonFrequencies: [0.3] }
    // histogram holds 60% of 1000 rows; the common value 5 (300 rows) sits below every bound except the first
    expect(ascendingAnchors(skewed, 1000, 'integer').map(a => a.position)).toEqual([0, 450, 600, 750, 900])
  })

  it('mirrors positions for descending sorts', () => {
    const asc = ascendingAnchors(stats, 400, 'integer')
    expect(descendingAnchors(asc, 400)).toEqual([
      { position: 0, value: '40' },
      { position: 100, value: '30' },
      { position: 200, value: '20' },
      { position: 300, value: '10' },
      { position: 400, value: '0' },
    ])
  })
})
