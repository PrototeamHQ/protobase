import { describe, expect, it } from 'vitest'
import { createAwayClock } from './away-clock'

describe('createAwayClock', () => {
  it('gives the time since the app left, once, and 0 when it never left', () => {
    let now = 1_000
    const clock = createAwayClock(() => now)
    expect(clock.back()).toBe(0)
    clock.leave()
    now += 360_000
    expect(clock.back()).toBe(360_000)
    expect(clock.back()).toBe(0)
  })
})
