import { describe, expect, it } from 'vitest'
import { squashItems, withSquashItems } from './release-commits.ts'

const fields = '\n-hash-\nabc123\n'

describe('squashItems', () => {
  it('keeps a commit without items as it is', () => {
    const chunk = `fix: a fix\n\nIts body.\n${fields}`
    expect(squashItems(chunk)).toEqual({ commit: chunk, items: [] })
  })

  it('splits a squash commit into its message above the items and each item, with its body, under the same fields', () => {
    const chunk = `chore: land a branch (#5)\n\n* fix: a fix (#1)\n\n* feat!: a change\n\nBREAKING CHANGE: do this instead\n${fields}`
    expect(squashItems(chunk)).toEqual({
      commit: `chore: land a branch (#5)\n${fields}`,
      items: [
        { message: 'fix: a fix (#1)', chunk: `fix: a fix (#1)\n${fields}` },
        { message: 'feat!: a change\n\nBREAKING CHANGE: do this instead', chunk: `feat!: a change\n\nBREAKING CHANGE: do this instead\n${fields}` },
      ],
    })
  })

  it('reads a message without fields', () => {
    expect(squashItems('chore: land (#5)\n\n* fix: a fix\n').items).toEqual([{ message: 'fix: a fix', chunk: 'fix: a fix\n' }])
  })

  it('never reads the header as an item', () => {
    expect(squashItems(`* fix: not an item\n${fields}`).items).toEqual([])
  })
})

describe('withSquashItems', () => {
  it('lists an item only under the oldest commit that lists it, newest first', () => {
    const older = 'chore: land 1 of 2\n\n* fix: a fix\n'
    const newer = 'chore: land 2 of 2\n\n* fix: a fix\n\n* feat: a feature\n'
    expect(withSquashItems([newer, older])).toEqual(['chore: land 2 of 2\n', 'feat: a feature\n', 'chore: land 1 of 2\n', 'fix: a fix\n'])
  })
})
