import { describe, expect, it } from 'vitest'
import { pushMessage, PushMessageError, type PushMessage } from './message'

const refused = (input: unknown) => {
  try {
    pushMessage(input as PushMessage)
  } catch (error) {
    if (error instanceof PushMessageError) return error.field
    throw error
  }
  throw new Error('accepted')
}

describe('pushMessage', () => {
  it('accepts every field of the common message and the platforms', () => {
    const message: PushMessage = {
      title: 'Task 12 assigned',
      body: 'Line one\nline two',
      url: 'https://app.example/tasks/12',
      data: { task: 12 },
      badge: 3,
      sound: 'default',
      tag: 'task-12',
      ttl: 3600,
      urgency: 'high',
      platform: { web: { ttl: 60, urgency: 'low', topic: 'other', payload: { icon: '/icon.png' } }, apns: { aps: { 'thread-id': 'x' } }, fcm: { android: { priority: 'high' } } },
    }
    expect(pushMessage(message)).toEqual(message)
  })

  it('answers a new object, the url as the parser writes it', () => {
    const input = { title: 'x', url: 'https://evil.example\\@app.example/' }
    const message = pushMessage(input)
    expect(message).not.toBe(input)
    expect(message.url).toBe('https://evil.example/@app.example/')
  })

  it.each(['javascript:alert(1)', '/tasks/1', 'data:text/html,x'])('refuses the url %j', (url) => {
    expect(refused({ title: 'x', url })).toBe('url')
  })

  it('accepts a url on another origin', () => {
    expect(pushMessage({ title: 'x', url: 'https://other.example/' }).url).toBe('https://other.example/')
  })

  it.each([
    [{ title: '' }, 'title'],
    [{ title: 'a\u0000b' }, 'title'],
    [{ title: 'x', body: 'a\u0007b' }, 'body'],
    [{ title: 'x', tag: 'a\r\nb' }, 'tag'],
    [{ title: 'x', tag: 'a\u0000' }, 'tag'],
    [{ title: 'x', tag: 'a'.repeat(33) }, 'tag'],
    [{ title: 'x', ttl: -1 }, 'ttl'],
    [{ title: 'x', ttl: 2_419_201 }, 'ttl'],
    [{ title: 'x', ttl: 1.5 }, 'ttl'],
    [{ title: 'x', urgency: 'urgent' }, 'urgency'],
    [{ title: 'x', badge: -1 }, 'badge'],
    [{ title: 'x', inbox: true }, 'inbox'],
    [{ title: 'x', data: [1] }, 'data'],
  ])('refuses %j, naming %s', (input, field) => {
    expect(refused(input)).toBe(field)
  })

  it.each(['endpoint', 'url', 'proxy', 'agent', 'vapidDetails', 'headers', 'body', 'Authorization', 'Crypto-Key', 'Content-Encoding', 'TTL'])('refuses platform.web.%s', (key) => {
    expect(refused({ title: 'x', platform: { web: { [key]: 'x' } } })).toBe(`platform.web.${key}`)
  })

  it.each([
    [{ topic: 'a\nb' }, 'platform.web.topic'],
    [{ topic: 'a\u0000' }, 'platform.web.topic'],
    [{ ttl: '60\r\nX-Injected: 1' }, 'platform.web.ttl'],
    [{ ttl: 2_419_201 }, 'platform.web.ttl'],
    [{ urgency: 'urgent' }, 'platform.web.urgency'],
  ])('refuses the Web Push header field %j', (web, field) => {
    expect(refused({ title: 'x', platform: { web } })).toBe(field)
  })

  it('refuses an unknown platform', () => {
    expect(refused({ title: 'x', platform: { windows: {} } })).toBe('platform.windows')
  })

  it.each([
    ['{"title":"x","platform":{"web":{"payload":{"__proto__":{"polluted":1}}}}}', 'platform.web.payload.__proto__'],
    ['{"title":"x","platform":{"web":{"payload":{"a":{"constructor":{"prototype":{"polluted":1}}}}}}}', 'platform.web.payload.a.constructor'],
    ['{"title":"x","data":{"prototype":1}}', 'data.prototype'],
    ['{"title":"x","platform":{"apns":{"__proto__":{"polluted":1}}}}', 'platform.apns.__proto__'],
    ['{"__proto__":{"polluted":1},"title":"x"}', '__proto__'],
  ])('refuses a prototype key in %s', (text, field) => {
    expect(refused(JSON.parse(text))).toBe(field)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('names the field and never its value', () => {
    expect(() => pushMessage({ title: 'x', url: 'javascript:secret-value' })).toThrow('The notification is invalid: url')
  })
})
