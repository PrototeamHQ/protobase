import { BaseSequencer, type Vitest } from 'vitest/node'
import { describe, expect, it } from 'vitest'
import { legFiles, shardOptions } from './shard.mjs'

const root = '/repo'
const specs = (count: number) => Array.from({ length: count }, (_, i) => ({ moduleId: `${root}/packages/core/tests/file-${i}.test.ts` }))
const leg = (index: number, selected: { moduleId: string }[]) =>
  legFiles(new BaseSequencer({ config: { root, shard: { index, count: 2 } } } as unknown as Vitest), selected)

describe('the shard split of the selected test files', () => {
  it.each([1, 2, 3, 57, 116])('puts each of %i selected files in exactly one of 2 legs, at most one apart', async (count) => {
    const selected = specs(count)
    const [first, second] = [await leg(1, selected), await leg(2, selected)]
    expect([...first, ...second].map((spec) => spec.moduleId).sort()).toEqual(selected.map((spec) => spec.moduleId).sort())
    expect(Math.abs(first.length - second.length)).toBeLessThanOrEqual(1)
  })

  it('gives both legs nothing when nothing is selected', async () => {
    expect([await leg(1, []), await leg(2, [])]).toEqual([[], []])
  })

  it('lets a leg whose shard gets no test file pass', () => {
    expect(shardOptions('2/2')).toEqual({ shard: '2/2', passWithNoTests: true })
    expect(shardOptions(undefined)).toEqual({})
  })
})
