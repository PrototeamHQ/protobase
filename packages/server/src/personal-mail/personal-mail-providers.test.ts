import { describe, expect, it } from 'vitest'
import { gmailSendScope, gmailSettingsScope } from './gmail'
import { resolvePersonalMail } from './personal-mail-providers'

describe('resolvePersonalMail', () => {
  it('links Gmail through Google sign-in, asking for offline access and the send scope alone', () => {
    const [gmail] = resolvePersonalMail(['gmail'], ['github', 'google'], true)
    expect(gmail).toMatchObject({ id: 'gmail', name: 'Gmail', signInProvider: 'google', scopes: [gmailSendScope], linkParams: { access_type: 'offline', prompt: 'consent' } })
  })

  it('stops at startup on a provider it does not know', () => {
    expect(() => resolvePersonalMail(['outlook'], ['google'], true)).toThrow('auth.personalMail: "outlook" is not a mail provider; use one of gmail')
  })

  it('stops at startup when the sign-in provider to link through is missing', () => {
    expect(() => resolvePersonalMail(['gmail'], ['github'], true)).toThrow('auth.personalMail: Gmail links through the sign-in provider "google"; add it to auth.socialProviders')
  })

  it('stops at startup when the linked accounts\' tokens would be stored in plain text, naming the setting', () => {
    expect(() => resolvePersonalMail(['gmail'], ['google'], false)).toThrow("auth.personalMail: the linked mailboxes' tokens would be stored in plain text; turn on auth.encryptOAuthTokens")
    expect(resolvePersonalMail([], ['google'], false)).toEqual([])
  })
})

describe('resolvePersonalMail with added scopes', () => {
  it('adds an optional scope the provider offers and keeps its listing ability', () => {
    const [gmail] = resolvePersonalMail([{ provider: 'gmail', scopes: [gmailSettingsScope] }], ['google'], true)
    expect(gmail).toMatchObject({ scopes: [gmailSendScope], addedScopes: [gmailSettingsScope] })
    expect(gmail!.list_sender_addresses).toBeTypeOf('function')
  })

  it('adds none without them', () => {
    expect(resolvePersonalMail(['gmail'], ['google'], true)[0]!.addedScopes).toEqual([])
  })

  it('stops at startup on a scope the provider does not offer, naming it', () => {
    expect(() => resolvePersonalMail([{ provider: 'gmail', scopes: ['https://mail.google.com/'] }], ['google'], true)).toThrow('auth.personalMail: Gmail does not take the scope "https://mail.google.com/"; use one of https://www.googleapis.com/auth/gmail.settings.basic')
  })
})
