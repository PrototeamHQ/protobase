import { expect, it } from 'vitest'
import { asksAgainFor, unknownIdRefetchMs } from './use-members'

const now = 1_000_000_000_000
const loaded = { isSuccess: true, isFetching: false, dataUpdatedAt: now - unknownIdRefetchMs }

it('reads the members again for an unknown id once the list is 10 seconds old', () => {
  expect(asksAgainFor(loaded, now)).toBe(true)
  expect(asksAgainFor({ ...loaded, dataUpdatedAt: now - unknownIdRefetchMs + 1 }, now)).toBe(false)
})

it('does not read them again before they loaded, nor while they are being read', () => {
  expect(asksAgainFor({ ...loaded, isSuccess: false }, now)).toBe(false)
  expect(asksAgainFor({ ...loaded, isFetching: true }, now)).toBe(false)
})
