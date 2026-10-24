import { describe, expect, it } from 'vitest'
import { checkSenders, type PushSender } from './sender'
import { generateVapidKeys } from './web-push/keys'

const send: PushSender['send'] = async () => []

describe('checkSenders', () => {
  it('accepts senders of different kinds, with a public key for web', () => {
    const senders: PushSender[] = [{ kinds: ['web'], publicKey: generateVapidKeys().publicKey, send }, { kinds: ['apns', 'fcm'], send }]
    expect(checkSenders(senders)).toBe(senders)
  })

  it.each([
    ['no send method', [{ kinds: ['web'] }], 'sender 0 has no send method'],
    ['no kinds', [{ kinds: [], send }], 'sender 0 names no kinds'],
    ['an unknown kind', [{ kinds: ['sms'], send }], 'sender 0 names a kind that is none of'],
    ['a kind twice', [{ kinds: ['web'], send }, { kinds: ['fcm', 'web'], send }], 'sender 1 delivers to web devices, as an earlier sender does'],
    ['no list', { kinds: ['web'], send }, 'is a list of senders'],
  ])('refuses %s', (_name, senders, message) => {
    expect(() => checkSenders(senders as never)).toThrow(message)
  })

  it('refuses a publicKey that is no public key, without echoing it', () => {
    const { privateKey } = generateVapidKeys()
    expect(() => checkSenders([{ kinds: ['web'], publicKey: privateKey, send }])).toThrow('sender 0 has a publicKey that is not a P-256 public key')
    expect(() => checkSenders([{ kinds: ['web'], publicKey: privateKey, send }])).not.toThrow(privateKey)
    expect(() => checkSenders([{ kinds: ['web'], publicKey: 'config-string', send }])).toThrow('publicKey')
  })
})
