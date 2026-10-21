import { describe, expect, it } from 'vitest'
import { chartPoints } from './chart-points'

const at = (time: string) => Date.parse(`2026-08-01T${time}Z`)

describe('chartPoints', () => {
  it("puts each series' number of a bucket under its key, a bucket without samples as a gap", () => {
    const cpu = [
      { value: '2026-08-01T10:00:00', count: 1, average: 12.5, maximum: 20 },
      { value: '2026-08-01T10:01:00', count: 0, average: null, maximum: null },
      { value: '2026-08-01T10:02:00', count: 2, average: 30, maximum: 41 },
    ]
    const memory = [
      { value: '2026-08-01T10:00:00', count: 1, average: 512, maximum: 600 },
      { value: '2026-08-01T10:01:00', count: 0, average: null, maximum: null },
      { value: '2026-08-01T10:02:00', count: 2, average: 640, maximum: 700 },
    ]
    expect(chartPoints([cpu, memory], ['s0', 's1'], 'maximum')).toEqual([
      { at: at('10:00:00'), value: null, count: 1, s0: 20, s1: 600 },
      { at: at('10:01:00'), value: null, count: 0, s0: null, s1: null },
      { at: at('10:02:00'), value: null, count: 2, s0: 41, s1: 700 },
    ])
  })

  it('keeps a bucket only one series reached, in time order, with a gap for the others', () => {
    const early = [{ value: '2026-08-01T10:00:00', count: 1, average: 1 }]
    const late = [{ value: '2026-08-01T10:01:00', count: 1, average: 2 }]
    expect(chartPoints([late, early], ['s0', 's1'], 'average')).toEqual([
      { at: at('10:00:00'), value: null, count: 1, s0: null, s1: 1 },
      { at: at('10:01:00'), value: null, count: 1, s0: 2, s1: null },
    ])
  })
})
