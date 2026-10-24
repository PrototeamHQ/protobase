import { describe, expect, it } from 'vitest'
import { historyPath } from './paths'

describe('historyPath', () => {
  it('names the list, its unread count, marking all and marking one read', () => {
    expect(historyPath('/api')).toBe('/api/notifications/history')
    expect(historyPath('/api', 'unread')).toBe('/api/notifications/history/unread')
    expect(historyPath('/api', 'read')).toBe('/api/notifications/history/read')
    expect(historyPath('/api', { read: '0b6f8a52-3c1e-4c7a-9d2f-6a4b8e1c2d3f' })).toBe('/api/notifications/history/0b6f8a52-3c1e-4c7a-9d2f-6a4b8e1c2d3f/read')
  })

  it.each(['../devices/x', '.', '..', 'a/b', '%2e%2e', 'a?b', 'a#b', ''])('refuses the id %s, which could leave the history', (id) => {
    expect(() => historyPath('/api', { read: id })).toThrow('A history entry id is letters, digits')
  })
})
