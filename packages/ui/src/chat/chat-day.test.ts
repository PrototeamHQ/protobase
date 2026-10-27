import { describe, expect, it } from 'vitest'
import { chatDayLabel, sameChatDay } from './chat-day'

const zone = 'Europe/Amsterdam'
// 27 Oct 2026, 10:00 in Amsterdam
const now = Date.parse('2026-10-27T09:00:00Z')

describe('sameChatDay', () => {
  it("reads both times on the viewer's calendar, not UTC's", () => {
    expect(sameChatDay('2026-10-26T23:30:00Z', '2026-10-27T08:00:00Z', zone)).toBe(true)
    expect(sameChatDay('2026-10-26T22:30:00Z', '2026-10-27T08:00:00Z', zone)).toBe(false)
    expect(sameChatDay('2026-10-26T23:30:00Z', '2026-10-27T08:00:00Z', 'UTC')).toBe(false)
  })
})

describe('chatDayLabel', () => {
  it('says Today and Yesterday, and the date further back', () => {
    expect(chatDayLabel('2026-10-26T23:30:00Z', now, zone)).toBe('Today')
    expect(chatDayLabel('2026-10-26T08:00:00Z', now, zone)).toBe('Yesterday')
    expect(chatDayLabel('2026-10-25T21:00:00Z', now, zone)).toBe('Sunday, 25 Oct 2026')
  })

  it('counts yesterday by the calendar across a change of the clocks', () => {
    // The clocks went back on 25 Oct 2026, a day of 25 hours
    expect(chatDayLabel('2026-10-24T22:30:00Z', Date.parse('2026-10-25T23:30:00Z'), zone)).toBe('Yesterday')
  })
})
