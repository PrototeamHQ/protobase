import { describe, expect, it, vi } from 'vitest'
import { heardTyping, nextExpiry, typersOn, typingSendGapMs, typingSender, typingShownMs, typingSpot, withoutExpired, type Typers } from './typing'

const none: Typers = new Map()

describe('heardTyping', () => {
  it('shows a typer in their spot until typingShownMs after the last, and no longer once they stop', () => {
    const one = heardTyping(none, 'conversations/7', 'u2', { typing: true, thread: null }, 1000)
    expect(one.get('conversations/7')).toEqual(new Map([['u2', 1000 + typingShownMs]]))
    expect(heardTyping(one, 'conversations/7', 'u2', { typing: false, thread: null }, 2000).size).toBe(0)
  })

  it('keeps typing in a thread apart from typing outside threads, and takes a payload without a thread as outside', () => {
    const typers = heardTyping(heardTyping(none, 'c/7', 'u2', { typing: true, thread: 42 }, 0), 'c/7', 'u3', { typing: true }, 0)
    expect(typersOn(typers, typingSpot('c/7', '42'), undefined)).toEqual(['u2'])
    expect(typersOn(typers, typingSpot('c/7', null), undefined)).toEqual(['u3'])
    expect(typersOn(typers, typingSpot('c/7', 'other'), undefined)).toEqual([])
  })

  it('passes over a payload that is no typing', () => {
    expect(heardTyping(none, 'c/7', 'u2', { typing: 'yes' }, 0)).toBe(none)
    expect(heardTyping(none, 'c/7', 'u2', { typing: true, thread: { key: 1 } }, 0)).toBe(none)
    expect(heardTyping(none, 'c/7', 'u2', 'typing', 0)).toBe(none)
    expect(heardTyping(none, 'c/7', 'u2', null, 0)).toBe(none)
  })
})

describe('the typers in time', () => {
  it('drops those who ran out, keeps the same object when none did, and names the next expiry', () => {
    const typers = heardTyping(heardTyping(none, 'a/1', 'u2', { typing: true }, 0), 'b/1', 'u3', { typing: true }, 2000)
    expect(nextExpiry(typers)).toBe(typingShownMs)
    expect(withoutExpired(typers, 1)).toBe(typers)
    const later = withoutExpired(typers, typingShownMs)
    expect([...later.keys()]).toEqual(['b/1'])
    expect(nextExpiry(none)).toBeUndefined()
  })

  it("leaves out the reader's own typing on their other devices", () => {
    const typers = heardTyping(heardTyping(none, 'a/1', 'me', { typing: true }, 0), 'a/1', 'u2', { typing: true }, 0)
    expect(typersOn(typers, 'a/1', 'me')).toEqual(['u2'])
  })
})

describe('typingSender', () => {
  const clock = () => {
    let now = 0
    const timers: Array<{ at: number; run: () => void; live: boolean }> = []
    return {
      now: () => now,
      setTimer: (run: () => void, ms: number) => {
        const timer = { at: now + ms, run, live: true }
        timers.push(timer)
        return () => void (timer.live = false)
      },
      advance: (ms: number) => {
        now += ms
        for (const timer of timers.filter((one) => one.live && one.at <= now)) {
          timer.live = false
          timer.run()
        }
      },
    }
  }

  it('says the person types at most once a gap, a change within it once it passed, and that they stopped once', () => {
    const time = clock()
    const send = vi.fn(() => true)
    const sender = typingSender(send, time)
    sender.onText('h')
    sender.onText('he')
    expect(send.mock.calls).toEqual([[true]])
    time.advance(typingSendGapMs)
    expect(send.mock.calls).toEqual([[true], [true]])
    sender.onSent()
    sender.onSent()
    expect(send.mock.calls).toEqual([[true], [true], [false]])
  })

  it('says nothing for an empty box, and tries again on the next change when it could not send', () => {
    const time = clock()
    const send = vi.fn(() => false)
    const sender = typingSender(send, time)
    sender.onText('  ')
    expect(send).not.toHaveBeenCalled()
    sender.onText('h')
    send.mockReturnValue(true)
    sender.onText('hi')
    expect(send.mock.calls).toEqual([[true], [true]])
  })
})
