import { describe, expect, it } from 'vitest'
import { connectionUnavailable } from './connection-availability'
import type { TypeEntry } from './type-list'

const type = (connection?: TypeEntry['connection']): Omit<TypeEntry, 'available'> => ({ id: 'acme:read', kind: 'step', plugin: 'acme', label: 'Read', description: '', input: {}, ...(connection && { connection }) })
const google = type({ name: 'google', label: 'Google account', signIn: 'google' })
const own = type({ name: 'account', label: 'Acme account', oauth: { authorization_url: 'https://acme.test/a', token_url: 'https://acme.test/t', user_info_url: 'https://acme.test/me' } })
const support = { encrypted: true, signInProviders: ['google'], clients: ['acme:account'] }

describe('connectionUnavailable', () => {
  it('makes a type available once the app can make its connection, and one without a connection always', () => {
    const unavailable = connectionUnavailable(support)
    expect([unavailable(type()), unavailable(google), unavailable(own)]).toEqual([undefined, undefined, undefined])
  })

  it('says why the app cannot make it: no sign-in, plain-text tokens, a missing sign-in provider or client', () => {
    expect(connectionUnavailable(undefined)(google)).toMatch(/no sign-in/)
    expect(connectionUnavailable(undefined)(type())).toBeUndefined()
    expect(connectionUnavailable({ ...support, encrypted: false })(own)).toMatch(/encryptOAuthTokens/)
    expect(connectionUnavailable({ ...support, signInProviders: [] })(google)).toMatch(/"google", which is not one of this app's sign-in providers/)
    expect(connectionUnavailable({ ...support, clients: [] })(own)).toMatch(/acme:account, whose OAuth client this app does not set in auth.connections/)
  })
})
