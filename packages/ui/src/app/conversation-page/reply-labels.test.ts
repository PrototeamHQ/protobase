import { describe, expect, it } from 'vitest'
import { lastReplyLabel } from './reply-labels'

describe('lastReplyLabel', () => {
  it("names the day and the time of day of the thread's last reply", () => {
    const now = Date.parse('2026-11-21T15:00:00Z')
    expect(lastReplyLabel('2026-11-21T10:42:00Z', now, 'UTC')).toBe('Last reply Today, 10:42')
    expect(lastReplyLabel('2026-11-20T09:05:00Z', now, 'UTC')).toBe('Last reply Yesterday, 09:05')
  })
})
