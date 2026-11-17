import { describe, expect, it } from 'vitest'
import { readPlatformSignIns } from './platform-sign-in-env'

const env = { PROTOBASE_SIGN_IN_ISSUER: 'https://auth.example.com', PROTOBASE_SIGN_IN_CLIENT_ID: 'app.example.com', PROTOBASE_SIGN_IN_CLIENT_SECRET: 'secret' }
const settings = { issuer: 'https://auth.example.com', clientId: 'app.example.com', clientSecret: 'secret' }
// The one provider an environment with the first set alone passes.
const one = (variables: Record<string, string | undefined>) => {
  const [first, ...more] = readPlatformSignIns(variables)
  expect(more).toEqual([])
  return first
}

describe('readPlatformSignIns, the first provider', () => {
  it('is none without any of the three, and reads all of them with the optional id and name', () => {
    expect(readPlatformSignIns({})).toEqual([])
    expect(readPlatformSignIns({ PROTOBASE_SIGN_IN_ISSUER: ' ' })).toEqual([])
    expect(one(env)).toEqual(settings)
    expect(one({ ...env, PROTOBASE_SIGN_IN_PROVIDER: 'github', PROTOBASE_SIGN_IN_NAME: 'GitHub' })).toEqual({ ...settings, provider: 'github', name: 'GitHub' })
  })

  it('reads token sign-in from PROTOBASE_SIGN_IN_TOKENS, true or false only', () => {
    expect(one({ ...env, PROTOBASE_SIGN_IN_TOKENS: 'true' })).toEqual({ ...settings, tokenSignIn: true })
    expect(one({ ...env, PROTOBASE_SIGN_IN_TOKENS: 'false' })).toEqual({ ...settings, tokenSignIn: false })
    expect(one({ ...env, PROTOBASE_SIGN_IN_TOKENS: '' })).toEqual(settings)
    for (const value of ['on', '1', 'yes', 'TRUE']) expect(() => one({ ...env, PROTOBASE_SIGN_IN_TOKENS: value })).toThrow(/PROTOBASE_SIGN_IN_TOKENS must be true or false/)
  })

  it('refuses token sign-in without the provider', () => {
    expect(() => one({ PROTOBASE_SIGN_IN_TOKENS: 'true' })).toThrow(/needs the platform sign-in provider/)
    expect(readPlatformSignIns({ PROTOBASE_SIGN_IN_TOKENS: 'false' })).toEqual([])
  })

  it('refuses some but not all of the three', () => {
    expect(() => one({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_ID: 'app' })).toThrow(/go together/)
    expect(() => one({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_SECRET: 'secret', PROTOBASE_SIGN_IN_TOKENS: 'true' })).toThrow(/go together/)
    expect(() => one({ PROTOBASE_SIGN_IN_CLIENT_ID: 'app', PROTOBASE_SIGN_IN_TOKENS: 'true' })).toThrow(/go together/)
  })

  it('reads the issuer alone, or with the client id, for token sign-in alone', () => {
    expect(one({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_TOKENS: 'true' })).toEqual({ issuer: settings.issuer, tokenSignIn: true })
    expect(one({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_ID: 'app', PROTOBASE_SIGN_IN_TOKENS: 'true' })).toEqual({ issuer: settings.issuer, clientId: 'app', tokenSignIn: true })
    expect(() => one({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER })).toThrow(/token sign-in alone/)
  })
})

describe('readPlatformSignIns, further providers', () => {
  const central = { PROTOBASE_SIGN_IN_2_ISSUER: 'https://id.example.net', PROTOBASE_SIGN_IN_2_PROVIDER: 'central', PROTOBASE_SIGN_IN_2_NAME: 'Central', PROTOBASE_SIGN_IN_2_TOKENS: 'true' }

  it('reads each numbered set after the first, in order, with the same rules', () => {
    expect(readPlatformSignIns({ ...env, ...central })).toEqual([settings, { issuer: 'https://id.example.net', provider: 'central', name: 'Central', tokenSignIn: true }])
    const third = { PROTOBASE_SIGN_IN_3_ISSUER: 'https://sso.example.org', PROTOBASE_SIGN_IN_3_CLIENT_ID: 'app', PROTOBASE_SIGN_IN_3_CLIENT_SECRET: 'other', PROTOBASE_SIGN_IN_3_PROVIDER: 'sso' }
    expect(readPlatformSignIns({ ...env, ...central, ...third }).map(({ provider }) => provider)).toEqual([undefined, 'central', 'sso'])
    expect(() => readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_2_ISSUER: 'https://id.example.net' })).toThrow(/PROTOBASE_SIGN_IN_2_ISSUER with PROTOBASE_SIGN_IN_2_TOKENS=true/)
    expect(() => readPlatformSignIns({ ...env, ...central, PROTOBASE_SIGN_IN_2_TOKENS: 'on' })).toThrow(/PROTOBASE_SIGN_IN_2_TOKENS must be true or false/)
  })

  it('refuses a gap in the numbers, or a set whose number is not 2 or more as written', () => {
    expect(() => readPlatformSignIns(central)).toThrow('The platform sign-in providers are numbered without gaps, up to PROTOBASE_SIGN_IN_2_ISSUER: set PROTOBASE_SIGN_IN_ISSUER too')
    expect(() => readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_3_ISSUER: 'https://id.example.net', PROTOBASE_SIGN_IN_3_TOKENS: 'true' })).toThrow(/set PROTOBASE_SIGN_IN_2_ISSUER too/)
    expect(() => readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_2_NAME: 'Central' })).toThrow(/set PROTOBASE_SIGN_IN_2_ISSUER too/)
    for (const variable of ['PROTOBASE_SIGN_IN_1_ISSUER', 'PROTOBASE_SIGN_IN_0_ISSUER', 'PROTOBASE_SIGN_IN_02_ISSUER']) {
      expect(() => readPlatformSignIns({ ...env, [variable]: 'https://id.example.net' })).toThrow(`${variable}: the first platform sign-in provider's variables have no number`)
    }
  })

  it('reads fixed authorization parameters as a query string, and hidden as true or false', () => {
    expect(one({ ...env, PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS: 'connection=github&audience=app', PROTOBASE_SIGN_IN_HIDDEN: 'true' })).toEqual({ ...settings, authorizationParams: { connection: 'github', audience: 'app' }, hidden: true })
    expect(readPlatformSignIns({ ...env, ...central, PROTOBASE_SIGN_IN_2_AUTHORIZATION_PARAMS: 'connection=github', PROTOBASE_SIGN_IN_2_HIDDEN: 'false' })[1]).toMatchObject({ authorizationParams: { connection: 'github' }, hidden: false })
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS: 'connection=github&connection=other' })).toThrow('PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS names connection twice')
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS: '=github' })).toThrow(/must be written as name=value/)
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_HIDDEN: 'yes' })).toThrow(/PROTOBASE_SIGN_IN_HIDDEN must be true or false/)
    expect(one({ ...env, PROTOBASE_SIGN_IN_BUTTON: 'false' })).toEqual({ ...settings, button: false })
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_BUTTON: 'off' })).toThrow(/PROTOBASE_SIGN_IN_BUTTON must be true or false/)
    expect(readPlatformSignIns({ ...env, ...central, PROTOBASE_SIGN_IN_2_DEVICES: 'true' })[1]).toMatchObject({ devices: true })
    expect(() => readPlatformSignIns({ ...env, ...central, PROTOBASE_SIGN_IN_2_DEVICES: 'on' })).toThrow(/PROTOBASE_SIGN_IN_2_DEVICES must be true or false/)
  })

  it('leaves out an empty numbered variable', () => {
    expect(readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_2_ISSUER: '', PROTOBASE_SIGN_IN_4_NAME: ' ' })).toEqual([settings])
  })
})
