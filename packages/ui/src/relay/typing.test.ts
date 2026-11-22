import { describe, expect, it, vi } from 'vitest'
import type { RelayEvent } from '@protobase/client'
import { heardTyping, nextExpiry, typersOn, typingSendGapMs, typingSender, typingShownMs, withoutExpired, type Typers } from './typing'

const typing = (user: string, channel: string, on: boolean, event = 'typing'): RelayEvent => ({ event, payload: { typing: on }, from: { user, connection: 'c' }, at: 0, channel })
const none: Typers = new Map()

describe('heardTyping', () => {
  it('shows a typer on their channel until typingShownMs after the last, and no longer once they stop', () => {
    const one = heardTyping(none, typing('u2', 'conversations/7', true), 1000)
    expect(one.get('conversations/7')).toEqual(new Map([['u2', 1000 + typingShownMs]]))
    expect(heardTyping(one, typing('u2', 'conversations/7', false), 2000).size).toBe(0)
  })

  it('passes over another event, a direct event and a payload that is no typing', () => {
    expect(heardTyping(none, typing('u2', 'conversations/7', true, 'ring'), 0)).toBe(none)
    expect(heardTyping(none, { ...typing('u2', 'conversations/7', true), channel: undefined, to: 'u1' }, 0)).toBe(none)
    expect(heardTyping(none, { ...typing('u2', 'conversations/7', true), payload: { typing: 'yes' } }, 0)).toBe(none)
  })
})

describe('the typers in time', () => {
  it('drops those who ran out, keeps the same object when none did, and names the next expiry', () => {
    const typers = heardTyping(heardTyping(none, typing('u2', 'a/1', true), 0), typing('u3', 'b/1', true), 2000)
    expect(nextExpiry(typers)).toBe(typingShownMs)
    expect(withoutExpired(typers, 1)).toBe(typers)
    const later = withoutExpired(typers, typingShownMs)
    expect([...later.keys()]).toEqual(['b/1'])
    expect(nextExpiry(none)).toBeUndefined()
  })

  it("leaves out the reader's own typing on their other devices", () => {
    const typers = heardTyping(heardTyping(none, typing('me', 'a/1', true), 0), typing('u2', 'a/1', true), 0)
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
