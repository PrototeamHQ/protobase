import { describe, expect, it } from 'vitest'
import { gmail, gmailSendScope } from './gmail'
import { mailProviderOf, scopesHandedOver } from './mail-link-hooks'

const providers = [gmail()]
const [mail] = providers
const row = (id: string, scope: string | null, providerId = 'google') => ({ id, userId: 'u1', providerId, scope })

describe('the mail link hand-over', () => {
  it('takes the mail scopes off the person’s other accounts of the provider, keeping their other scopes', () => {
    const linked = row('b', `openid,email,${gmailSendScope}`)
    expect(scopesHandedOver(mail!, linked, [row('a', `openid,email,profile,${gmailSendScope}`), linked])).toEqual([{ id: 'a', scope: 'openid,email,profile' }])
  })

  it('leaves the scope empty when an account held the mail scopes only', () => {
    const linked = row('b', gmailSendScope)
    expect(scopesHandedOver(mail!, linked, [row('a', gmailSendScope), linked])).toEqual([{ id: 'a', scope: null }])
  })

  it('names no mail provider for an account written without the mail scopes, or of another sign-in provider', () => {
    expect(mailProviderOf(providers, row('b', 'openid,email,profile'))).toBeUndefined()
    expect(mailProviderOf(providers, row('gh', gmailSendScope, 'github'))).toBeUndefined()
    expect(mailProviderOf(providers, row('b', `openid ${gmailSendScope}`))).toBe(mail)
  })

  it('leaves accounts of other providers and accounts without the mail scopes as they are', () => {
    const linked = row('b', gmailSendScope)
    expect(scopesHandedOver(mail!, linked, [row('a', 'openid,email'), row('gh', gmailSendScope, 'github'), linked])).toEqual([])
  })
})
