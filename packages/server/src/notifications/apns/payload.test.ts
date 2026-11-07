import { describe, expect, it } from 'vitest'
import { PushMessageError, pushMessage } from '../message'
import { apnsHeaders, apnsPayload } from './payload'

describe('apnsHeaders', () => {
  it('sets the topic, push type, priority, expiration and collapse id from the message', () => {
    expect(apnsHeaders({ title: 'Hi', ttl: 60, urgency: 'low', tag: 'order-1' }, 'net.example.app', 1000)).toEqual({
      'apns-topic': 'net.example.app',
      'apns-push-type': 'alert',
      'apns-priority': '5',
      'apns-expiration': '1060',
      'apns-collapse-id': 'order-1',
    })
  })

  it('delivers at once and keeps a message 28 days by default, and only tries once with a ttl of 0', () => {
    expect(apnsHeaders({ title: 'Hi' }, 'net.example.app', 1000)).toEqual({ 'apns-topic': 'net.example.app', 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(1000 + 2_419_200) })
    expect(apnsHeaders({ title: 'Hi', ttl: 0, urgency: 'very-low' }, 'net.example.app', 1000)).toMatchObject({ 'apns-priority': '1', 'apns-expiration': '0' })
  })

  it('takes nothing from platform.apns', () => {
    const headers = apnsHeaders({ title: 'Hi', platform: { apns: { 'apns-topic': 'com.other.app', 'apns-push-type': 'background', 'apns-priority': '1' } } }, 'net.example.app', 1000)
    expect(headers).toMatchObject({ 'apns-topic': 'net.example.app', 'apns-push-type': 'alert', 'apns-priority': '10' })
  })

  it('never gets a tag that is not header-safe: the message refuses it', () => {
    for (const tag of ['a\r\nb', 'a\u0001', 'x'.repeat(65), 'a b']) expect(() => pushMessage({ title: 'Hi', tag })).toThrow(new PushMessageError('tag'))
  })
})

describe('apnsPayload', () => {
  it('holds the alert, badge, sound, url and data', () => {
    expect(apnsPayload({ title: 'Hi', body: 'There', badge: 3, sound: 'default', url: 'https://example.com/a', data: { order: 1 } })).toEqual({
      aps: { alert: { title: 'Hi', body: 'There' }, badge: 3, sound: 'default' },
      url: 'https://example.com/a',
      data: { order: 1 },
    })
  })

  it('merges platform.apns over it', () => {
    expect(apnsPayload({ title: 'Hi', body: 'There', platform: { apns: { aps: { 'thread-id': 'chat', alert: { subtitle: 'Sub' } }, extra: true } } })).toEqual({
      aps: { alert: { title: 'Hi', body: 'There', subtitle: 'Sub' }, 'thread-id': 'chat' },
      extra: true,
    })
  })

  it('checks a url platform.apns sets', () => {
    expect(apnsPayload({ title: 'Hi', platform: { apns: { url: 'https://example.com' } } }).url).toBe('https://example.com/')
    expect(() => apnsPayload({ title: 'Hi', platform: { apns: { url: 'javascript:alert(1)' } } })).toThrow(new PushMessageError('platform.apns.url'))
  })
})
