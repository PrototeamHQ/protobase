import { describe, expect, it } from 'vitest'
import { isAtEnd, scrollAfterChange } from './thread-scroll'

describe('isAtEnd', () => {
  it('counts a box scrolled to within a little of its end as at the end', () => {
    expect(isAtEnd({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true)
    expect(isAtEnd({ scrollTop: 580, scrollHeight: 1000, clientHeight: 400 })).toBe(true)
    expect(isAtEnd({ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 })).toBe(false)
    expect(isAtEnd({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true)
  })
})

describe('scrollAfterChange', () => {
  const now = { first: 'm1', anchorTop: 40, scrollTop: 200, scrollHeight: 1200 }

  it('follows a new message only for a reader at the end', () => {
    expect(scrollAfterChange({ atEnd: true, first: 'm1', anchor: { element: 'm7', top: 40 } }, now)).toBe(1200)
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm4', top: 40 } }, now)).toBeUndefined()
  })

  it('keeps the message being read in place when earlier ones load above it', () => {
    const loaded = { first: 'm0', anchorTop: 640, scrollTop: 0, scrollHeight: 1800 }
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm1', top: 40 } }, loaded)).toBe(600)
    // A thread too short to scroll is at its end and its top at once: loading earlier messages still keeps the place
    expect(scrollAfterChange({ atEnd: true, first: 'm1', anchor: { element: 'm1', top: 40 } }, loaded)).toBe(600)
  })

  it('goes to the end when the follow key changes, wherever the reader was', () => {
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm4', top: 40 }, followKey: 0 }, { ...now, followKey: 1 })).toBe(1200)
    // The reader sent while earlier messages came in above: the end still wins
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm1', top: 40 }, followKey: 0 }, { first: 'm0', anchorTop: 640, scrollTop: 0, scrollHeight: 1800, followKey: 1 })).toBe(1800)
  })

  it('leaves a reader who scrolled back in place for a message with an unchanged follow key', () => {
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm4', top: 40 }, followKey: 1 }, { ...now, followKey: 1 })).toBeUndefined()
    const loaded = { first: 'm0', anchorTop: 640, scrollTop: 0, scrollHeight: 1800, followKey: 1 }
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm1', top: 40 }, followKey: 1 }, loaded)).toBe(600)
  })

  it('goes to the end of a chat that shows its first messages', () => {
    expect(scrollAfterChange({ atEnd: true, first: undefined }, now)).toBe(1200)
  })

  it('opens a chat that gets its first messages on its "New messages" line, or at the end without one', () => {
    expect(scrollAfterChange({ atEnd: true, first: undefined }, { ...now, scrollTop: 0, newLineTop: 700 })).toBe(684)
    expect(scrollAfterChange({ atEnd: true, first: undefined }, { ...now, scrollTop: 0, newLineTop: 10 })).toBe(0)
    expect(scrollAfterChange({ atEnd: true, first: undefined }, { ...now, scrollTop: 0 })).toBe(1200)
  })

  it('leaves the "New messages" line once the chat has messages: a reader at the end follows the next', () => {
    expect(scrollAfterChange({ atEnd: true, first: 'm1', anchor: { element: 'm7', top: 40 } }, { ...now, newLineTop: 300 })).toBe(1200)
    expect(scrollAfterChange({ atEnd: false, first: 'm1', anchor: { element: 'm4', top: 40 } }, { ...now, newLineTop: 300 })).toBeUndefined()
  })
})
