import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readFcmSettings } from './fcm-settings'
import { testServiceAccount } from './testing/service-account'

const account = testServiceAccount()
const read = (value: unknown) => () => readFcmSettings({ PROTOBASE_FCM_SERVICE_ACCOUNT: typeof value === 'string' ? value : JSON.stringify(value) })

// The error a value stops startup with, which names the variable and holds nothing of the value.
const failure = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  let message = ''
  try {
    read(value)()
  } catch (error) {
    message = (error as Error).message
  }
  expect(message).toContain('PROTOBASE_FCM_SERVICE_ACCOUNT')
  for (const part of text.match(/[A-Za-z0-9+/]{12,}/g) ?? []) expect(message).not.toContain(part)
  return message
}

describe('readFcmSettings', () => {
  it('reads the project, the address and a key that signs and cannot be exported', () => {
    const settings = account.settings()
    expect(settings.projectId).toBe('example-project')
    expect(settings.clientEmail).toBe('fcm-sender@example.com')
    expect(settings.privateKey.extractable).toBe(false)
    expect(settings.privateKey.usages).toEqual(['sign'])
    expect(JSON.stringify(settings)).not.toContain('PRIVATE KEY')
  })

  it('turns FCM off when the variable is unset or blank', () => {
    expect(readFcmSettings({})).toBeUndefined()
    expect(readFcmSettings({ PROTOBASE_FCM_SERVICE_ACCOUNT: '  ' })).toBeUndefined()
  })

  it('stops on JSON that is no service account, naming the variable and never quoting the value', () => {
    expect(failure(`{"private_key": "${account.json.private_key.slice(30, 90)}`)).toContain('is not JSON')
    expect(failure(['a list'])).toContain('not a JSON object')
    expect(failure({ ...account.json, type: 'authorized_user' })).toContain('type')
    expect(failure({ ...account.json, project_id: 'x/../../other' })).toContain('project_id')
    expect(failure({ ...account.json, project_id: undefined })).toContain('project_id')
    expect(failure({ ...account.json, client_email: 'nobody' })).toContain('client_email')
  })

  it('stops on a private key that is not an RSA key of at least 2048 bits, before any send', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    expect(failure({ ...account.json, private_key: 'not a key' })).toContain('private_key')
    expect(failure({ ...account.json, private_key: account.json.private_key.replace(/[A-Za-z]/g, 'A') })).toContain('private_key')
    expect(failure({ ...account.json, private_key: ec })).toContain('RSA')
    expect(failure({ ...account.json, private_key: testServiceAccount(1024).json.private_key })).toContain('2048')
    expect(failure({ ...account.json, private_key: 42 })).toContain('private_key')
  })

  it('reads no endpoint from the JSON', () => {
    const settings = readFcmSettings({ PROTOBASE_FCM_SERVICE_ACCOUNT: JSON.stringify({ ...account.json, token_uri: 'https://attacker.example/token' }) })!
    expect(Object.keys(settings).sort()).toEqual(['clientEmail', 'privateKey', 'projectId'])
  })
})
