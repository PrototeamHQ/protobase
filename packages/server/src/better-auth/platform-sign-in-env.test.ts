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

describe('readPlatformSignIns, providers named by their id', () => {
  const phone = { PROTOBASE_SIGN_IN_PHONE_ISSUER: 'https://id.example.net', PROTOBASE_SIGN_IN_PHONE_NAME: 'Phone', PROTOBASE_SIGN_IN_PHONE_TOKENS: 'true' }
  const phoneSettings = { issuer: 'https://id.example.net', provider: 'phone', name: 'Phone', tokenSignIn: true }

  it('reads each after the unnamed one, in order of their id whatever the order of the variables, with the same rules', () => {
    expect(readPlatformSignIns({ ...env, ...phone })).toEqual([settings, phoneSettings])
    const sso = { PROTOBASE_SIGN_IN_ACME_SSO_ISSUER: 'https://sso.example.org', PROTOBASE_SIGN_IN_ACME_SSO_CLIENT_ID: 'app', PROTOBASE_SIGN_IN_ACME_SSO_CLIENT_SECRET: 'other' }
    expect(readPlatformSignIns({ ...phone, ...sso, ...env }).map(({ provider }) => provider)).toEqual([undefined, 'acme-sso', 'phone'])
    expect(readPlatformSignIns({ ...sso, ...phone }).map(({ provider }) => provider)).toEqual(['acme-sso', 'phone'])
    expect(() => readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_PHONE_ISSUER: 'https://id.example.net' })).toThrow(/PROTOBASE_SIGN_IN_PHONE_ISSUER with PROTOBASE_SIGN_IN_PHONE_TOKENS=true/)
    expect(() => readPlatformSignIns({ ...env, ...phone, PROTOBASE_SIGN_IN_PHONE_TOKENS: 'on' })).toThrow(/PROTOBASE_SIGN_IN_PHONE_TOKENS must be true or false/)
  })

  it('stands without the unnamed one', () => {
    expect(readPlatformSignIns(phone)).toEqual([phoneSettings])
  })

  it('refuses a set without its issuer, a number or other non-id in the name, and a _PROVIDER of its own', () => {
    expect(() => readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_PHONE_NAME: 'Phone' })).toThrow('The platform sign-in provider phone needs PROTOBASE_SIGN_IN_PHONE_ISSUER')
    for (const variable of ['PROTOBASE_SIGN_IN_2_ISSUER', 'PROTOBASE_SIGN_IN_phone_ISSUER', 'PROTOBASE_SIGN_IN_PHONE.APP_ISSUER']) {
      expect(() => readPlatformSignIns({ ...env, [variable]: 'https://id.example.net' })).toThrow(`${variable}: a platform sign-in provider's variables name it by its id`)
    }
    expect(() => readPlatformSignIns({ ...env, ...phone, PROTOBASE_SIGN_IN_PHONE_PROVIDER: 'other' })).toThrow("PROTOBASE_SIGN_IN_PHONE_PROVIDER: the provider's id is already in the variable's name")
  })

  it('reads fixed authorization parameters as a query string, and hidden as true or false', () => {
    expect(one({ ...env, PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS: 'connection=github&audience=app', PROTOBASE_SIGN_IN_HIDDEN: 'true' })).toEqual({ ...settings, authorizationParams: { connection: 'github', audience: 'app' }, hidden: true })
    expect(readPlatformSignIns({ ...env, ...phone, PROTOBASE_SIGN_IN_PHONE_AUTHORIZATION_PARAMS: 'connection=github', PROTOBASE_SIGN_IN_PHONE_HIDDEN: 'false' })[1]).toMatchObject({ authorizationParams: { connection: 'github' }, hidden: false })
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS: 'connection=github&connection=other' })).toThrow('PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS names connection twice')
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS: '=github' })).toThrow(/must be written as name=value/)
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_HIDDEN: 'yes' })).toThrow(/PROTOBASE_SIGN_IN_HIDDEN must be true or false/)
    expect(one({ ...env, PROTOBASE_SIGN_IN_BUTTON: 'false' })).toEqual({ ...settings, button: false })
    expect(() => one({ ...env, PROTOBASE_SIGN_IN_BUTTON: 'off' })).toThrow(/PROTOBASE_SIGN_IN_BUTTON must be true or false/)
    expect(readPlatformSignIns({ ...env, ...phone, PROTOBASE_SIGN_IN_PHONE_DEVICES: 'true' })[1]).toMatchObject({ devices: true })
    expect(() => readPlatformSignIns({ ...env, ...phone, PROTOBASE_SIGN_IN_PHONE_DEVICES: 'on' })).toThrow(/PROTOBASE_SIGN_IN_PHONE_DEVICES must be true or false/)
  })

  it('leaves out an empty variable', () => {
    expect(readPlatformSignIns({ ...env, PROTOBASE_SIGN_IN_PHONE_ISSUER: '', PROTOBASE_SIGN_IN_OTHER_NAME: ' ', PROTOBASE_SIGN_IN_2_ISSUER: '' })).toEqual([settings])
  })
})
