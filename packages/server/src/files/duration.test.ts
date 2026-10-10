import { describe, expect, it } from 'vitest'
import { parseDuration } from './duration'

describe('durations', () => {
  it('read days, hours and short units', () => {
    expect(parseDuration('1 day', 'retention')).toBe(86_400_000)
    expect(parseDuration('14d', 'retention')).toBe(14 * 86_400_000)
    expect(parseDuration('12 hours', 'retention')).toBe(12 * 3_600_000)
    expect(parseDuration('0', 'retention')).toBe(0)
    expect(parseDuration(500, 'retention')).toBe(500)
  })

  it('refuse anything else, naming the setting', () => {
    expect(() => parseDuration('soon', 'files.retention')).toThrow('files.retention is "soon"')
    expect(() => parseDuration('5', 'retention')).toThrow('write it like')
    expect(() => parseDuration(-1, 'retention')).toThrow('whole number')
  })
})
