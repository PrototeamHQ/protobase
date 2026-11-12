import { describe, expect, it } from 'vitest'
import { nestedHeadingLevel } from './nested-heading-level'

describe('nestedHeadingLevel', () => {
  it('keeps the level with no heading above', () => {
    expect([1, 2, 3, 6].map((depth) => nestedHeadingLevel(depth, 0))).toEqual([1, 2, 3, 6])
  })

  it('puts a heading one level below a section heading, shifting deeper ones along', () => {
    expect([1, 2, 3, 4, 5, 6].map((depth) => nestedHeadingLevel(depth, 2))).toEqual([3, 3, 4, 5, 6, 6])
  })

  it('goes no deeper than h6', () => {
    expect([1, 2, 6].map((depth) => nestedHeadingLevel(depth, 5))).toEqual([6, 6, 6])
  })
})
