import { describe, expect, it } from 'vitest'
import { deviceInput } from './device-input'

const p256dh = Buffer.alloc(65, 4).toString('base64url')
const auth = Buffer.alloc(16, 1).toString('base64url')
const web = { kind: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def', keys: { p256dh, auth } }
const apns = { kind: 'apns', token: 'ab'.repeat(32), environment: 'production', appId: 'net.example.app' }
const fcm = { kind: 'fcm', token: 'dXyz-_:APA91bHu' }

const refused = (body: unknown) => {
  try {
    deviceInput(body)
  } catch (error) {
    return error as { status: number; detail: string }
  }
  throw new Error('accepted')
}

describe('deviceInput', () => {
  it('reads each kind, with null for what does not apply', () => {
    expect(deviceInput(web)).toEqual({ kind: 'web', token: web.endpoint, p256dh, auth, environment: null, appId: null, userAgent: null })
    expect(deviceInput({ ...apns, userAgent: 'App/1' })).toEqual({ kind: 'apns', token: apns.token, p256dh: null, auth: null, environment: 'production', appId: 'net.example.app', userAgent: 'App/1' })
    expect(deviceInput(fcm)).toEqual({ kind: 'fcm', token: fcm.token, p256dh: null, auth: null, environment: null, appId: null, userAgent: null })
  })

  it('keeps one spelling of a web endpoint', () => {
    expect(deviceInput({ ...web, endpoint: 'https://FCM.googleapis.com/fcm/send/abc:def' }).token).toBe(web.endpoint)
  })

  it.each([
    'http://169.254.169.254/',
    'https://10.0.0.5/',
    'https://127.0.0.1.nip.io/',
    'http://fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com@evil.example/x',
    'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://fcm.googleapis.com/x#fragment',
    'https://notify.windows.com/x',
    'https://fcm.googleapis.com/x\ty',
  ])('refuses the web endpoint %s', (endpoint) => {
    expect(refused({ ...web, endpoint })).toMatchObject({ status: 400, detail: 'The device is invalid: endpoint' })
  })

  it('takes the push services of each browser', () => {
    for (const endpoint of ['https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/QGx']) {
      expect(deviceInput({ ...web, endpoint }).token).toBe(endpoint)
    }
  })

  it.each([
    ['an unknown kind', { ...fcm, kind: 'sms' }],
    ['an unknown environment', { ...apns, environment: 'staging' }],
    ['an APNs token that is not lowercase hex', { ...apns, token: 'AB'.repeat(32) }],
    ['a short APNs token', { ...apns, token: 'ab' }],
    ['an FCM token with other characters', { ...fcm, token: 'abc/def' }],
    ['a p256dh key of the wrong size', { ...web, keys: { p256dh: Buffer.alloc(64).toString('base64url'), auth } }],
    ['an auth key of the wrong size', { ...web, keys: { p256dh, auth: Buffer.alloc(17).toString('base64url') } }],
    ['a padded key', { ...web, keys: { p256dh: `${p256dh}=`, auth } }],
    ['an app id with other characters', { ...apns, appId: 'net/example' }],
    ['a user agent over its cap', { ...fcm, userAgent: 'x'.repeat(513) }],
    ['a user agent with control characters', { ...fcm, userAgent: 'App\n1' }],
    ['a missing field', { kind: 'apns', token: apns.token, environment: 'production' }],
    ['a field of another kind', { ...fcm, environment: 'production' }],
    ['web keys on a phone', { ...apns, keys: { p256dh, auth } }],
    ['a user id', { ...fcm, userId: 'b' }],
    ['a snake-case user id', { ...fcm, user_id: 'b' }],
    ['an owner', { ...fcm, owner: 'b' }],
    ['an id', { ...fcm, id: '00000000-0000-0000-0000-000000000000' }],
    ['times', { ...fcm, createdAt: '2020-01-01', lastSeenAt: '2020-01-01' }],
    ['a nested proto', JSON.parse(`{"kind":"fcm","token":"abc","__proto__":{"userId":"b"}}`)],
    ['no body', null],
  ])('refuses %s with a 400 that never repeats the value', (_, body) => {
    const problem = refused(body)
    expect(problem.status).toBe(400)
    expect(problem.detail).toMatch(/^The device is invalid: [\w.]+$/)
  })
})
