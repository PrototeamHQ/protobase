import { describe, expect, it } from 'vitest'
import { bellLabel, unreadBadge } from './unread-label'

describe('the unread count', () => {
  it('shows over the bell up to 99, then 99+, and not at all while nothing is unread', () => {
    expect([undefined, 0, 1, 99, 100].map(unreadBadge)).toEqual([undefined, undefined, '1', '99', '99+'])
  })

  it('names the bell with how many are unread', () => {
    expect([undefined, 0, 3, 100].map(bellLabel)).toEqual(['Notifications', 'Notifications', 'Notifications, 3 unread', 'Notifications, more than 99 unread'])
  })
})
