import { describe, expect, it } from 'vitest'
import { bellLabel } from './unread-label'

describe('the unread count', () => {
  it('names the bell with how many are unread', () => {
    expect([undefined, 0, 3, 100].map(bellLabel)).toEqual(['Notifications', 'Notifications', 'Notifications, 3 unread', 'Notifications, more than 99 unread'])
  })
})
