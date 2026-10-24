import { describe, expect, it } from 'vitest'
import { pushMessage, PushMessageError, type PushMessage } from '../message'
import { webPushPayload } from './payload'

const refused = (message: PushMessage) => {
  try {
    webPushPayload(message)
  } catch (error) {
    if (error instanceof PushMessageError) return error.field
    throw error
  }
  throw new Error('accepted')
}

describe('webPushPayload', () => {
  it('carries the common message, with platform.web.payload merged over it', () => {
    const message = pushMessage({ title: 'Hi', body: 'There', url: 'https://app.example/x', data: { a: 1, b: { c: 2 } }, badge: 2, tag: 't', platform: { web: { payload: { title: 'Override', icon: '/i.png', data: { b: { d: 3 } } } } } })
    expect(webPushPayload(message)).toEqual({ title: 'Override', body: 'There', url: 'https://app.example/x', data: { a: 1, b: { c: 2, d: 3 } }, badge: 2, tag: 't', icon: '/i.png' })
  })

  it('writes every url as the parser writes it', () => {
    const payload = webPushPayload({ title: 'x', platform: { web: { payload: { url: 'https://evil.example\\@app.example/', notification: { navigate: 'HTTPS://APP.EXAMPLE', actions: [{ action: 'a', navigate: 'https://app.example/a' }] } } } } })
    expect(payload).toMatchObject({ url: 'https://evil.example/@app.example/', notification: { navigate: 'https://app.example/', actions: [{ action: 'a', navigate: 'https://app.example/a' }] } })
  })

  it.each([
    [{ url: 'javascript:alert(1)' }, 'platform.web.payload.url'],
    [{ url: '/relative' }, 'platform.web.payload.url'],
    [{ url: ['https://app.example/'] }, 'platform.web.payload.url'],
    [{ notification: 'x' }, 'platform.web.payload.notification'],
    [{ notification: { navigate: 'javascript:alert(1)' } }, 'platform.web.payload.notification.navigate'],
    [{ notification: { navigate: { href: 'https://app.example/' } } }, 'platform.web.payload.notification.navigate'],
    [{ notification: { actions: { navigate: 'https://app.example/' } } }, 'platform.web.payload.notification.actions'],
    [{ notification: { actions: ['x'] } }, 'platform.web.payload.notification.actions.0'],
    [{ notification: { actions: [{ action: 'ok', navigate: 'https://app.example/' }, { action: 'bad', navigate: 'javascript:alert(1)' }] } }, 'platform.web.payload.notification.actions.1.navigate'],
  ])('refuses the payload %j', (payload, field) => {
    expect(refused({ title: 'x', platform: { web: { payload } } } as PushMessage)).toBe(field)
  })
})
