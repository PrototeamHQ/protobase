import { describe, expect, it } from 'vitest'
import { itemsProblem, pollProblem } from './poll-result'

describe('pollProblem', () => {
  it('takes items within the limit, each with a key, and a small cursor and store', () => {
    expect(pollProblem({ items: [{ key: 'a', data: { n: 1 } }], cursor: 'a', store: { seen: 1 } }, 10)).toBeUndefined()
  })

  it('refuses more items than the limit, a missing or long key, and data over the run input limit', () => {
    expect(pollProblem({ items: [{ key: 'a' }, { key: 'b' }], cursor: null }, 1)).toBe('gave 2 items, more than its limit of 1')
    expect(pollProblem({ items: [{ data: 1 }], cursor: null }, 10)).toBe('item 0 has no key of 1 to 200 characters')
    expect(pollProblem({ items: [{ key: 'k'.repeat(201) }], cursor: null }, 10)).toBe('item 0 has no key of 1 to 200 characters')
    expect(pollProblem({ items: [{ key: 'a', data: 'x'.repeat(1024 * 1024 + 1) }], cursor: null }, 10)).toBe("item 0's data is over 1 MiB as JSON")
    expect(pollProblem({ cursor: null }, 10)).toBe('gave no items array')
  })

  it('refuses a cursor or store over 64 KiB, so the write never meets the table check', () => {
    expect(pollProblem({ items: [], cursor: 'x'.repeat(64 * 1024) }, 10)).toBe('gave a cursor over 64 KiB as JSON')
    expect(pollProblem({ items: [], cursor: null, store: 'x'.repeat(64 * 1024) }, 10)).toBe('gave a store over 64 KiB as JSON')
  })
})

describe('itemsProblem', () => {
  it('takes a webhook item without a key, and still checks a key it gives', () => {
    expect(itemsProblem([{ data: 1 }], 100, false)).toBeUndefined()
    expect(itemsProblem([{ key: '', data: 1 }], 100, false)).toBe('item 0 has no key of 1 to 200 characters')
    expect(itemsProblem(Array.from({ length: 101 }, () => ({ data: 1 })), 100, false)).toBe('gave 101 items, more than its limit of 100')
  })
})
