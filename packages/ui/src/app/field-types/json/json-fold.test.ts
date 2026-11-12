import { describe, expect, it } from 'vitest'
import { foldOf } from './json-fold'

const linesOf = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')

describe('a JSON block’s fold', () => {
  it('keeps a text of 20 lines whole', () => {
    expect(foldOf(linesOf(20))).toEqual({ lines: 20, folded: null })
  })

  it('folds a text of 21 lines to its first 20', () => {
    expect(foldOf(linesOf(21))).toEqual({ lines: 21, folded: linesOf(20) })
  })

  it('folds a 60-key object to its first 20 lines and counts all 62', () => {
    const value = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`key_${i}`, i]))
    const { lines, folded } = foldOf(JSON.stringify(value, null, 2))
    expect(lines).toBe(62)
    expect(folded!.split('\n')).toHaveLength(20)
    expect(folded!.startsWith('{\n  "key_0": 0,')).toBe(true)
  })
})
