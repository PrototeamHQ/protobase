import { describe, expect, it } from 'vitest'
import { fixedWindow, fixedWindows } from './fixed-window'

describe('fixedWindows', () => {
  it('lets max takes per key through in a window, counts no refused take, and starts over when it ends', () => {
    let at = 1000
    const take = fixedWindows(2, 100, () => at)
    expect([take('a'), take('a'), take('a'), take('a')]).toEqual([true, true, false, false])
    expect([take('b'), take('b'), take('b')]).toEqual([true, true, false])
    at += 99
    expect(take('a')).toBe(false)
    at += 1
    expect([take('a'), take('b'), take('a'), take('a')]).toEqual([true, true, true, false])
  })

  it('takes several keys at once only when every one of them fits', () => {
    const take = fixedWindows(2, 100, () => 0)
    take('a')
    expect(take.all(new Map([['b', 2], ['a', 2]]))).toBe(false)
    expect([take('b'), take('b'), take('b')]).toEqual([true, true, false])
    expect(take.all(new Map([['a', 1], ['c', 2]]))).toBe(true)
    expect([take('a'), take('c')]).toEqual([false, false])
  })

  it('has a one-key form', () => {
    let at = 0
    const take = fixedWindow(1, 10, () => at)
    expect([take(), take()]).toEqual([true, false])
    at = 10
    expect(take()).toBe(true)
  })
})
