import { describe, expect, it } from 'vitest'
import { checkCounter, passwordChecksPerWindow } from './password-checks'

const clock = () => {
  let at = 1_000_000
  return { now: () => at, advance: (ms: number) => (at += ms) }
}

describe('counting current-password checks', () => {
  it('lets an account check five times a minute, and refuses the rest of the minute with the seconds left', () => {
    const time = clock()
    const counter = checkCounter({ max: passwordChecksPerWindow, windowSeconds: 60, now: time.now })
    for (let check = 1; check <= 5; check++) expect(counter.take('ana')).toBeUndefined()
    time.advance(20_000)
    expect(counter.take('ana')).toBe(40)
    for (let check = 7; check <= 10; check++) expect(counter.take('ana')).toBe(40)
  })

  it('opens a new window once the minute is over', () => {
    const time = clock()
    const counter = checkCounter({ max: 5, windowSeconds: 60, now: time.now })
    for (let check = 1; check <= 5; check++) counter.take('ana')
    expect(counter.take('ana')).toBe(60)
    time.advance(60_000)
    expect(counter.take('ana')).toBeUndefined()
  })

  it("counts each account on its own, so one account's guesses refuse no other", () => {
    const counter = checkCounter({ max: 2, windowSeconds: 60 })
    counter.take('ana')
    counter.take('ana')
    expect(counter.take('ana')).toBeGreaterThan(0)
    expect(counter.take('bo')).toBeUndefined()
  })

  it('keeps at most the accounts it may, forgetting the oldest window first', () => {
    const time = clock()
    const counter = checkCounter({ max: 1, windowSeconds: 60, maxTracked: 2, now: time.now })
    counter.take('ana')
    counter.take('bo')
    counter.take('cy')
    expect(counter.take('ana')).toBeUndefined()
    expect(counter.take('cy')).toBe(60)
  })
})
