import { describe, expect, it } from 'vitest'
import { guestCallLink, readGuestCallLink } from './guest-call-link'

describe('a guest link', () => {
  it('carries its token in the fragment, which the browser never sends', () => {
    const link = new URL(guestCallLink('https://chat.example.com/app', 'pbgl_abc'))
    expect(link.href).toBe('https://chat.example.com/app/-/call-guest#pbgl_abc')
    expect(link.search).toBe('')
    expect(readGuestCallLink('/-/call-guest', link.hash)).toEqual({ token: 'pbgl_abc' })
  })

  it('is no guest link without a token, or on another page', () => {
    expect(readGuestCallLink('/-/call-guest', '')).toBeUndefined()
    expect(readGuestCallLink('/conversations/7', '#pbgl_abc')).toBeUndefined()
  })
})
