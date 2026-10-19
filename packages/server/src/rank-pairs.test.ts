import { describe, expect, it } from 'vitest'
import { newlyAbove } from './rank-pairs'

const pair = (dependent_rank: unknown, depended_rank: unknown) => ({ dependent: 7, depended: 3, dependent_rank, depended_rank })

describe('newlyAbove', () => {
  it('finds a record moved to or above one it depends on', () => {
    expect(newlyAbove([pair(2, 5)], new Map([['7', 9]]))).toEqual(pair(2, 5))
    expect(newlyAbove([pair(5, 5)], new Map([['3', 1]]))).toEqual(pair(5, 5))
  })

  it('finds a new record created at or above one it depends on', () => {
    expect(newlyAbove([pair(2, 5)], new Map([['7', null]]))).toEqual(pair(2, 5))
  })

  it('passes a pair still in order, one out of order before the write, and ranks not set', () => {
    expect(newlyAbove([pair(6, 5)], new Map([['7', 9]]))).toBeUndefined()
    expect(newlyAbove([pair(1, 5)], new Map([['7', 2]]))).toBeUndefined()
    expect(newlyAbove([pair(null, 5)], new Map([['7', 9]]))).toBeUndefined()
  })

  it('takes a rank Postgres gives as text, as a bigint', () => {
    expect(newlyAbove([pair('2', '5')], new Map([['7', '9']]))).toEqual(pair('2', '5'))
  })
})
