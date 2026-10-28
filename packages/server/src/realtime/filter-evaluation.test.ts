import { describe, expect, it } from 'vitest'
import { evaluateFilters } from './filter-evaluation'

// A read that fails whenever its indexes hold one of `bad`, with the reads it was asked for.
const reader = (bad: readonly number[]) => {
  const reads: number[][] = []
  const read = async (indexes: number[]) => {
    reads.push(indexes)
    return indexes.some((index) => bad.includes(index)) ? { ok: false as const, error: new Error('refused') } : { ok: true as const, value: undefined }
  }
  return { read, reads }
}

describe('evaluateFilters', () => {
  it('reads each chunk once when none fails', async () => {
    const { read, reads } = reader([])
    expect(await evaluateFilters([[0, 1], [2]], read)).toEqual(new Set())
    expect(reads).toEqual([[0, 1], [2]])
  })

  it('halves a failing chunk down to the filters that fail alone', async () => {
    const { read, reads } = reader([2, 7])
    expect(await evaluateFilters([[0, 1, 2, 3, 4, 5, 6, 7]], read)).toEqual(new Set([2, 7]))
    expect(reads).toEqual([[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3], [0, 1], [2, 3], [2], [3], [4, 5, 6, 7], [4, 5], [6, 7], [6], [7]])
  })

  it('narrows a chunk already known to fail without reading it again', async () => {
    const { read, reads } = reader([1])
    expect(await evaluateFilters([[2]], read, [0, 1])).toEqual(new Set([1]))
    expect(reads).toEqual([[0], [1], [2]])
  })
})
