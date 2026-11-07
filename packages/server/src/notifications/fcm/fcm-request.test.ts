import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../json-value'
import { pushMessage, PushMessageError, type PushMessage } from '../message'
import { fcmRequest } from './fcm-request'
import { fcmDevice } from './testing/fcm-device'
import { loadRecording, recordedMessage } from './testing/recordings'

const device = fcmDevice()
const build = (message: PushMessage) => fcmRequest(pushMessage(message), device)
const refusal = (message: PushMessage) => {
  try {
    build(message)
  } catch (error) {
    expect(error).toBeInstanceOf(PushMessageError)
    return (error as PushMessageError).field
  }
  throw new Error('The message was not refused')
}

describe('fcmRequest', () => {
  it('builds the request FCM took for the recordings, platform.fcm merged in', () => {
    expect(build(recordedMessage)).toEqual(loadRecording('send-unregistered').request.body)
  })

  it('sends only what the message gives', () => {
    expect(build({ title: 'Hi' })).toEqual({ message: { notification: { title: 'Hi' }, data: { user: 'user-1' }, android: {}, token: device.token } })
    expect(build({ title: 'Hi', urgency: 'low' }).message.android).toEqual({ priority: 'NORMAL' })
  })

  it('targets the device\'s own token and user whatever the message says', () => {
    const request = build({ title: 'Hi', data: { user: 'someone-else' }, platform: { fcm: { data: { user: 'another' } } } })
    expect(request.message.token).toBe(device.token)
    expect(request.message.data.user).toBe('user-1')
  })

  it('refuses platform.fcm fields that pick another target, another platform or something fired on tap', () => {
    const fields: JsonObject[] = [{ token: 'other' }, { topic: 'news' }, { condition: "'a' in topics" }, { name: 'projects/other/messages/1' }, { webpush: {} }, { apns: {} }, { validate_only: true }]
    for (const fcm of fields) {
      expect(refusal({ title: 'Hi', platform: { fcm } })).toBe(`platform.fcm.${Object.keys(fcm)[0]}`)
    }
    expect(refusal({ title: 'Hi', platform: { fcm: { android: { notification: { click_action: 'OPEN' } } } } })).toBe('platform.fcm.android.notification.click_action')
    expect(refusal({ title: 'Hi', platform: { fcm: { android: { restricted_package_name: 'com.other' } } } })).toBe('platform.fcm.android.restricted_package_name')
    expect(refusal({ title: 'Hi', platform: { fcm: { android: { data: { a: 'b' } } } } })).toBe('platform.fcm.android.data')
    expect(refusal({ title: 'Hi', platform: { fcm: { fcm_options: { link: 'https://elsewhere.example' } } } })).toBe('platform.fcm.fcm_options.link')
    expect(refusal({ title: 'Hi', platform: { fcm: { android: 'x' } } })).toBe('platform.fcm.android')
  })

  it('checks every url and image after the merge as the message\'s url is', () => {
    expect(refusal({ title: 'Hi', platform: { fcm: { data: { url: 'javascript:alert(1)' } } } })).toBe('data.url')
    expect(refusal({ title: 'Hi', data: { url: 'intent://x' } })).toBe('data.url')
    expect(refusal({ title: 'Hi', platform: { fcm: { notification: { image: 'file:///etc/passwd' } } } })).toBe('platform.fcm.notification.image')
    expect(refusal({ title: 'Hi', platform: { fcm: { android: { notification: { image: 'content://x' } } } } })).toBe('platform.fcm.android.notification.image')
    expect(build({ title: 'Hi', platform: { fcm: { notification: { image: 'https://cdn.example.com/a.png' } } } }).message.notification).toEqual({ title: 'Hi', image: 'https://cdn.example.com/a.png' })
  })

  it('writes data as strings and refuses the keys FCM keeps for itself', () => {
    expect(build({ title: 'Hi', data: { n: 1, list: [1, 'a'], flag: true, nothing: null } }).message.data).toEqual({ n: '1', list: '[1,"a"]', flag: 'true', nothing: 'null', user: 'user-1' })
    expect(refusal({ title: 'Hi', data: { from: 'x' } })).toBe('data.from')
    expect(refusal({ title: 'Hi', platform: { fcm: { data: { 'google.sent_time': '1' } } } })).toBe('data.google.sent_time')
  })
})
