import { describe, expect, it, vi } from 'vitest'
import { createPresenceStore, presenceOf } from './presence'

describe('createPresenceStore', () => {
  it('keeps the latest presence and tells its listeners only of a change', () => {
    const store = createPresenceStore()
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    const presence = { 'u-ann': 'online' as const }
    store.set(presence)
    store.set(presence)
    expect(store.get()).toBe(presence)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    store.set(undefined)
    expect(store.get()).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('presenceOf', () => {
  it("is a person's presence, nothing for someone the app leaves out or an app that gives none", () => {
    expect(presenceOf({ 'u-ann': 'away' }, 'u-ann')).toBe('away')
    expect(presenceOf({ 'u-ann': 'away' }, 'u-bo')).toBeUndefined()
    expect(presenceOf({}, 'toString')).toBeUndefined()
    expect(presenceOf(undefined, 'u-ann')).toBeUndefined()
  })
})
