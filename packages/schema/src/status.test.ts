import { describe, expect, it } from 'vitest'
import { heldStatus, maxStatusText, statusPath, statusTextProblem } from './status'

describe('statusPath', () => {
  it("names the caller's own status and the people's", () => {
    expect(statusPath('/api')).toBe('/api/status')
    expect(statusPath('/api', 'people')).toBe('/api/status/people')
  })
})

describe('statusTextProblem', () => {
  it('takes plain text up to the limit, counting an emoji as one character', () => {
    expect(statusTextProblem('Having lunch')).toBeUndefined()
    expect(statusTextProblem(`On vacation 🌴${'a'.repeat(maxStatusText - 13)}`)).toBeUndefined()
    expect(statusTextProblem('<b>not HTML</b>')).toBeUndefined()
  })

  it('refuses text over the limit', () => {
    expect(statusTextProblem('a'.repeat(maxStatusText + 1))).toBe('A status is at most 100 characters')
  })

  it.each(['two\nlines', 'a\ttab', 'bell\u0007', 'null\u0000', 'del\u007f'])('refuses the control characters of %j', (text) => {
    expect(statusTextProblem(text)).toBe('A status is one line of text, without control characters')
  })
})

describe('heldStatus', () => {
  const now = Date.parse('2026-10-29T12:00:00Z')

  it('holds a status without a clear time, or one whose time is still to come', () => {
    const busy = { availability: 'busy' as const, text: null, clearsAt: null }
    expect(heldStatus(busy, now)).toBe(busy)
    const lunch = { availability: 'automatic' as const, text: 'Having lunch', clearsAt: '2026-10-29T12:00:01Z' }
    expect(heldStatus(lunch, now)).toBe(lunch)
  })

  it('holds nothing once the clear time has passed, nor for a status that says nothing', () => {
    expect(heldStatus({ availability: 'do_not_disturb', text: null, clearsAt: '2026-10-29T12:00:00Z' }, now)).toBeUndefined()
    expect(heldStatus({ availability: 'automatic', text: null, clearsAt: null }, now)).toBeUndefined()
    expect(heldStatus(null, now)).toBeUndefined()
  })
})
