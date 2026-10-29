import { describe, expect, it } from 'vitest'
import { activeSpeaker, callLayout, cannotConnect, connectionQuality, gridColumns } from './call-layout'

describe('callLayout', () => {
  it('is alone with nobody else, a grid with others, and a share while someone shares their screen', () => {
    expect(callLayout({ people: 1, sharers: [], width: 1200 })).toEqual({ kind: 'alone' })
    expect(callLayout({ people: 3, sharers: [], width: 1200 })).toEqual({ kind: 'grid', columns: 2 })
    expect(callLayout({ people: 3, sharers: ['bob', 'cat'], width: 1200 })).toEqual({ kind: 'share', sharer: 'bob' })
    expect(callLayout({ people: 1, sharers: ['ann'], width: 1200 })).toEqual({ kind: 'share', sharer: 'ann' })
  })

  it('takes as square a grid as fits on a desktop, and at most two columns on a phone', () => {
    expect([2, 4, 5, 8, 9, 20].map((count) => gridColumns(count, 1200))).toEqual([2, 2, 3, 3, 3, 4])
    expect([2, 3, 8].map((count) => gridColumns(count, 390))).toEqual([1, 2, 2])
  })
})

describe('connectionQuality', () => {
  it('is poor past a 400 ms round trip or 5% loss', () => {
    expect(connectionQuality({ roundTripMs: 80, lostRatio: 0.01 })).toBe('good')
    expect(connectionQuality({ roundTripMs: 500 })).toBe('poor')
    expect(connectionQuality({ lostRatio: 0.08 })).toBe('poor')
    expect(connectionQuality({})).toBe('good')
  })
})

describe('cannotConnect', () => {
  it('gives up on a failed connection at once, and on one not up after 15 s', () => {
    expect(cannotConnect('failed', 0, 1)).toBe(true)
    expect(cannotConnect('connecting', 0, 14_999)).toBe(false)
    expect(cannotConnect('connecting', 0, 15_000)).toBe(true)
    expect(cannotConnect(undefined, 0, 15_000)).toBe(true)
    expect(cannotConnect('connected', 0, 60_000)).toBe(false)
  })
})

describe('activeSpeaker', () => {
  it('is the loudest who is loud enough', () => {
    expect(activeSpeaker(new Map([['ann', 0.2], ['bob', 0.4]]))).toBe('bob')
    expect(activeSpeaker(new Map([['ann', 0.01]]))).toBeUndefined()
  })
})
