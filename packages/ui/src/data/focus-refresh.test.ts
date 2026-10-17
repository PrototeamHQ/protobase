import { describe, expect, it } from 'vitest'
import { createFocusRefresh } from './focus-refresh'

describe('focus refresh', () => {
  it('refetches on focus always, until paused', () => {
    const refresh = createFocusRefresh()
    expect(refresh.refetchOnWindowFocus()).toBe('always')
    const release = refresh.pause()
    expect(refresh.refetchOnWindowFocus()).toBe(false)
    release()
    expect(refresh.refetchOnWindowFocus()).toBe('always')
  })
  it('stays paused while any pause holds, each released once', () => {
    const refresh = createFocusRefresh()
    const first = refresh.pause()
    const second = refresh.pause()
    first()
    first()
    expect(refresh.refetchOnWindowFocus()).toBe(false)
    second()
    expect(refresh.refetchOnWindowFocus()).toBe('always')
  })
})
