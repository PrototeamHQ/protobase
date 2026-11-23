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

describe('createPresenceStore with the relay', () => {
  it("puts the app's own presence over the relay's", () => {
    const store = createPresenceStore()
    store.heard({ 'u-ann': 'offline', 'u-bo': 'away' })
    expect(store.get()).toEqual({ 'u-ann': 'offline', 'u-bo': 'away' })
    store.set({ 'u-ann': 'online' })
    expect(store.get()).toEqual({ 'u-ann': 'online', 'u-bo': 'away' })
  })

  it('keeps who the page shows until each place that shows them lets go, telling only of someone new', () => {
    const store = createPresenceStore()
    const listener = vi.fn()
    store.onShown(listener)
    const list = store.show(['u-ann', 'u-bo'])
    const title = store.show(['u-ann'])
    expect(listener).toHaveBeenCalledTimes(1)
    list()
    expect(store.shown()).toEqual(['u-ann'])
    title()
    expect(store.shown()).toEqual([])
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
