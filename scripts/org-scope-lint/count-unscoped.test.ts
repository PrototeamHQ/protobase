import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { countUnscoped, unlistedCounts } from './count-unscoped'

const file = 'fixtures/two-unscoped.ts'
const found = { [file]: countUnscoped(path.join(import.meta.dirname, file)) }

describe('the unscoped() count', () => {
  it('counts the calls, not a mention in a comment', () => {
    expect(found[file]).toBe(2)
  })

  it("counts a call through a literal key, db['unscoped'](...)", () => {
    expect(countUnscoped(path.join(import.meta.dirname, 'fixtures/element-unscoped.ts'))).toBe(1)
  })

  it('fails on one use more than the reviewed list gives, and passes once the list names it', () => {
    expect(unlistedCounts(found, { [file]: 1 })).toEqual([`${file}: 2 unscoped() uses, the reviewed list gives 1: review them and set the list to 2`])
    expect(unlistedCounts(found, { [file]: 2 })).toEqual([])
  })

  it('fails on a list that gives more than the file holds, or a file it does not name', () => {
    expect(unlistedCounts(found, { [file]: 3 })).toHaveLength(1)
    expect(unlistedCounts({}, { [file]: 1 })).toHaveLength(1)
    expect(unlistedCounts(found, {})).toHaveLength(1)
  })
})
