import { describe, expect, it } from 'vitest'
import { diffStats, parseDiff } from './diff'

describe('parseDiff', () => {
  const lines = parseDiff(' keep\n-old\n+new\n+extra', 10)
  it('numbers lines per side', () => {
    expect(lines.map((line) => [line.kind, line.oldNo, line.newNo])).toEqual([
      ['ctx', 10, 10],
      ['del', 11, undefined],
      ['add', undefined, 11],
      ['add', undefined, 12],
    ])
  })
  it('strips markers and counts changes', () => {
    expect(lines[1]?.text).toBe('old')
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 })
  })
})
