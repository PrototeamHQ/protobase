import { describe, expect, it } from 'vitest'
import { apnsPayload } from '../notifications/apns/payload'
import { fcmRequest } from '../notifications/fcm/fcm-request'
import { fcmDevice } from '../notifications/fcm/testing/fcm-device'
import { pushMessage, type PushMessage } from '../notifications/message'
import { stampOrigin } from './stamp'

const origin = 'https://a.example.com'

describe('stampOrigin', () => {
  it('writes the origin into the APNs payload and the FCM data, over an origin the workspace gave', () => {
    const given: PushMessage = { title: 'Hi', url: 'https://a.example.com/x', data: { origin: 'https://b.example.com' }, platform: { apns: { origin: 'https://b.example.com' }, fcm: { data: { origin: 'https://b.example.com', kept: 'yes' } } } }
    const stamped = pushMessage(stampOrigin(pushMessage(given), origin))
    expect(apnsPayload(stamped).origin).toBe(origin)
    const fcm = fcmRequest(stamped, fcmDevice())
    expect(fcm.message.data.origin).toBe(origin)
    expect(fcm.message.data.kept).toBe('yes')
  })

  it('writes it into a message with no platform fields, and keeps the rest of the message', () => {
    const stamped = stampOrigin({ title: 'Hi', body: 'There', tag: 'x' }, origin)
    expect(stamped).toEqual({ title: 'Hi', body: 'There', tag: 'x', platform: { apns: { origin }, fcm: { data: { origin } } } })
    expect(apnsPayload(stamped)).toEqual({ aps: { alert: { title: 'Hi', body: 'There' } }, origin })
    expect(fcmRequest(stamped, fcmDevice()).message.data).toEqual({ origin, user: 'user-1' })
  })
})
