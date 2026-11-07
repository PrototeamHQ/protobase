import { describe, expect, it } from 'vitest'
import { checkNotificationsOptions } from './options'
import type { PushSender } from './sender'
import { notificationSenders, webPushKey } from './senders-of'
import { apnsTestEnv } from './testing/apns-service'
import { testServiceAccount } from './fcm/testing/service-account'
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

  it('has the built-in APNs sender when its environment and mobile.appId are set', () => {
    const senders = notificationSenders({}, { ...vapidEnv, ...apnsTestEnv() }, { appId: 'net.example.app' })
    expect(senders.map((sender) => sender.kinds)).toEqual([['web'], ['apns']])
    expect(notificationSenders({}, {}, { appId: 'net.example.app' })).toEqual([])
  })

  it('stops on APNs without mobile.appId, and on an APNs mistake', () => {
    expect(() => notificationSenders({}, apnsTestEnv())).toThrow('the config has no mobile.appId')
    expect(() => notificationSenders({}, { PROTOBASE_APNS_KEY_ID: 'ABC123DEFG' }, { appId: 'net.example.app' })).toThrow('PROTOBASE_APNS_KEY and PROTOBASE_APNS_TEAM_ID must be set')
  })

  it('has the built-in FCM sender, guarded, when its service account is set', async () => {
    const fcmEnv = { PROTOBASE_FCM_SERVICE_ACCOUNT: JSON.stringify(testServiceAccount().json) }
    expect(notificationSenders({}, { ...vapidEnv, ...fcmEnv }).map((sender) => sender.kinds)).toEqual([['web'], ['fcm']])
    const [fcm] = notificationSenders({}, fcmEnv)
    await expect(fcm!.send({ title: 'x', url: 'javascript:x' }, [])).rejects.toThrow('url')
  })

  it('stops on an FCM service account that is not one', () => {
    expect(() => notificationSenders({}, { PROTOBASE_FCM_SERVICE_ACCOUNT: '{"private_key": "abc' })).toThrow('PROTOBASE_FCM_SERVICE_ACCOUNT is not JSON')
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

  it('checks the senders as the notifications options take them', () => {
    expect(() => checkNotificationsOptions({ senders: [{ kinds: ['web'], publicKey: 'secret', send: async () => [] }] })).toThrow('publicKey')
  })
})
