import { describe, expect, it } from 'vitest'
import { messageId } from './message-id'

describe('messageId', () => {
  it('is a msg-id on the domain of the From address', () => {
    expect(messageId('noreply@shop.example.com')).toMatch(/^<[0-9a-f]{32}@shop\.example\.com>$/)
  })

  it('differs per message', () => {
    expect(messageId('noreply@shop.example.com')).not.toBe(messageId('noreply@shop.example.com'))
  })
})
