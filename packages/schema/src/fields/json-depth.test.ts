import { describe, expect, it } from 'vitest'
import { maxJsonDepth, withinJsonDepth } from './json-depth'

const arrays = (depth: number): unknown => JSON.parse('['.repeat(depth) + ']'.repeat(depth))
const objects = (depth: number): unknown => JSON.parse('{"a":'.repeat(depth - 1) + '{}' + '}'.repeat(depth - 1))

describe('withinJsonDepth', () => {
  it('counts each array or object as one level', () => {
    expect(withinJsonDepth(1, 0)).toBe(true)
    expect(withinJsonDepth([], 1)).toBe(true)
    expect(withinJsonDepth({ a: [1] }, 1)).toBe(false)
    expect(withinJsonDepth({ a: [1] }, 2)).toBe(true)
  })

  it('takes arrays and objects at the limit and refuses one level more', () => {
    expect([withinJsonDepth(arrays(maxJsonDepth)), withinJsonDepth(arrays(maxJsonDepth + 1))]).toEqual([true, false])
    expect([withinJsonDepth(objects(maxJsonDepth)), withinJsonDepth(objects(maxJsonDepth + 1))]).toEqual([true, false])
  })

  it('counts a mixed chain and one below a shallow wrapper from the root', () => {
    const mixed = (depth: number) => JSON.parse('[{"a":'.repeat(depth / 2) + '1' + '}]'.repeat(depth / 2))
    expect([withinJsonDepth(mixed(maxJsonDepth)), withinJsonDepth(mixed(maxJsonDepth + 2))]).toEqual([true, false])
    expect(withinJsonDepth({ a: { b: arrays(maxJsonDepth - 2) } })).toBe(true)
    expect(withinJsonDepth({ a: { b: arrays(maxJsonDepth - 1) } })).toBe(false)
  })

  it('refuses a value nested 100,000 levels without overflowing', () => {
    expect(withinJsonDepth(arrays(100_000))).toBe(false)
    expect(withinJsonDepth(objects(100_000))).toBe(false)
  })

  it('refuses a cyclic value', () => {
    const cycle: unknown[] = []
    cycle.push(cycle, cycle)
    expect(withinJsonDepth(cycle)).toBe(false)
  })

  it('takes a wide, shallow value', () => {
    expect(withinJsonDepth(Array.from({ length: 100_000 }, (_, i) => ({ i, tags: [[i]] })))).toBe(true)
  })
})
