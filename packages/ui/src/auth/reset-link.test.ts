import { describe, expect, it } from 'vitest'
import { readResetLink, resetLinkTarget, withoutResetLink } from './reset-link'

describe('reset links', () => {
  it('lead back to the page they were asked from, without its query', () => {
    expect(resetLinkTarget('https://admin.example.com/admin/orders/12?tab=lines#top')).toBe('https://admin.example.com/admin/orders/12?password-reset')
  })

  it('are read from the landing address: the token, or none for a used or expired link', () => {
    expect(readResetLink('https://admin.example.com/orders?password-reset=&token=abc123')).toEqual({ token: 'abc123' })
    expect(readResetLink('https://admin.example.com/orders?password-reset=&error=INVALID_TOKEN')).toEqual({ token: undefined })
    expect(readResetLink('https://admin.example.com/orders?token=abc123')).toBeUndefined()
    expect(readResetLink('https://admin.example.com/orders')).toBeUndefined()
  })

  it('leave the address bar as it was once used', () => {
    expect(withoutResetLink('https://admin.example.com/orders?password-reset=&token=abc123')).toBe('/orders')
    expect(withoutResetLink('https://admin.example.com/orders?q=x&password-reset=&error=INVALID_TOKEN#top')).toBe('/orders?q=x#top')
  })
})
