import { describe, expect, it } from 'vitest'
import { notifications } from './plugin'
import type { PushSender } from './sender'
import { notificationSenders, webPushKey } from './senders-of'
import { generateVapidKeys } from './web-push/keys'

const keys = generateVapidKeys()
const vapidEnv = { PROTOBASE_VAPID_PUBLIC_KEY: keys.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: keys.privateKey, PROTOBASE_VAPID_SUBJECT: 'https://example.com/contact' }

describe('notificationSenders', () => {
  it('has the built-in Web Push sender when its environment is set, and none otherwise', () => {
    const senders = notificationSenders({}, vapidEnv)
    expect(senders.map((sender) => sender.kinds)).toEqual([['web']])
    expect(webPushKey(senders)).toBe(keys.publicKey)
    expect(notificationSenders({}, {})).toEqual([])
    expect(webPushKey(notificationSenders({}, {}))).toBeUndefined()
  })

  it('stops on a VAPID mistake', () => {
    expect(() => notificationSenders({}, { PROTOBASE_VAPID_PUBLIC_KEY: keys.publicKey })).toThrow('PROTOBASE_VAPID_PRIVATE_KEY and PROTOBASE_VAPID_SUBJECT must be set')
  })

  it('uses the app\'s own senders in place of the built-in ones, guarded', async () => {
    const own: PushSender = { kinds: ['fcm'], send: async (_message, devices) => devices.map((device) => ({ id: device.id, result: 'ok' })) }
    const senders = notificationSenders({ senders: [own] }, vapidEnv)
    expect(senders).toHaveLength(1)
    expect(senders[0]).not.toBe(own)
    expect(webPushKey(senders)).toBeUndefined()
    await expect(senders[0]!.send({ title: 'x', url: 'javascript:x' }, [])).rejects.toThrow('url')
  })

  it('names a web sender\'s own public key', () => {
    const other = generateVapidKeys().publicKey
    expect(webPushKey(notificationSenders({ senders: [{ kinds: ['web'], publicKey: other, send: async () => [] }] }, {}))).toBe(other)
  })

  it('checks the senders as notifications() takes them', () => {
    expect(() => notifications({ senders: [{ kinds: ['web'], publicKey: 'secret', send: async () => [] }] })).toThrow('publicKey')
  })
})
