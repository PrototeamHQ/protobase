import { describe, expect, it } from 'vitest'
import { gmailSendScope } from './gmail'
import { resolvePersonalMail } from './personal-mail-providers'

describe('resolvePersonalMail', () => {
  it('links Gmail through Google sign-in, asking for offline access and the send scope alone', () => {
    const [gmail] = resolvePersonalMail(['gmail'], ['github', 'google'])
    expect(gmail).toMatchObject({ id: 'gmail', name: 'Gmail', signInProvider: 'google', scopes: [gmailSendScope], linkParams: { access_type: 'offline', prompt: 'consent' } })
  })

  it('stops at startup on a provider it does not know', () => {
    expect(() => resolvePersonalMail(['outlook'], ['google'])).toThrow('auth.personalMail: "outlook" is not a mail provider; use one of gmail')
  })

  it('stops at startup when the sign-in provider to link through is missing', () => {
    expect(() => resolvePersonalMail(['gmail'], ['github'])).toThrow('auth.personalMail: Gmail links through the sign-in provider "google"; add it to auth.socialProviders')
  })
})
