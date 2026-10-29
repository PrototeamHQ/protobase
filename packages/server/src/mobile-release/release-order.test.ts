import { describe, expect, it } from 'vitest'
import { formatReleaseOrder, releaseOrder } from './release-order'

describe('releaseOrder', () => {
  it("is the bundle's build time, then the served shell's own, 0 with the bundle's copy", () => {
    expect(releaseOrder({ builtAt: 5 })).toEqual([5, 0])
    expect(releaseOrder({ builtAt: 5, shell: { builtAt: 7 } })).toEqual([5, 7])
  })

  it('is none when the bundle or the served shell names no build time', () => {
    expect(releaseOrder({})).toBeUndefined()
    expect(releaseOrder({ builtAt: 5, shell: {} })).toBeUndefined()
  })
})

describe('formatReleaseOrder', () => {
  it('joins the elements with commas, as the Android live updater parses them', () => {
    expect(formatReleaseOrder([1800000000000, 0])).toBe('1800000000000,0')
  })
})
