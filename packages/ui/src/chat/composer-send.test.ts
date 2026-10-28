import { describe, expect, it } from 'vitest'
import { canSend } from './composer-send'

describe('canSend', () => {
  it('sends text', () => {
    expect(canSend('hi', {})).toBe(true)
  })

  it('does not send empty text by default', () => {
    expect(canSend('', {})).toBe(false)
    expect(canSend('', { canSendEmpty: false })).toBe(false)
  })

  it('sends empty text when allowed', () => {
    expect(canSend('', { canSendEmpty: true })).toBe(true)
  })

  it('sends nothing while busy', () => {
    expect(canSend('hi', { busy: true })).toBe(false)
    expect(canSend('', { busy: true, canSendEmpty: true })).toBe(false)
  })
})
