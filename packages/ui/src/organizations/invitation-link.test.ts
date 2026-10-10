import { describe, expect, it } from 'vitest'
import { readInvitationLink, withoutInvitationLink } from './invitation-link'

describe('the invitation link', () => {
  it('is the invitation page with a token, under any base path', () => {
    expect(readInvitationLink('https://admin.example.com/-/invitation?token=inv.sig')).toEqual({ token: 'inv.sig' })
    expect(readInvitationLink('https://admin.example.com/admin/-/invitation?token=a%2Eb')).toEqual({ token: 'a.b' })
    expect(readInvitationLink('https://admin.example.com/-/invitation')).toBeUndefined()
    expect(readInvitationLink('https://admin.example.com/companies?token=x')).toBeUndefined()
  })

  it('leaves for the start page once used', () => {
    expect(withoutInvitationLink('https://admin.example.com/-/invitation?token=x')).toBe('/')
    expect(withoutInvitationLink('https://admin.example.com/admin/-/invitation?token=x')).toBe('/admin/')
  })
})
