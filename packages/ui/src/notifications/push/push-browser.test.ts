import { describe, expect, it } from 'vitest'
import { windowPushBrowser } from './push-browser'

// A window with the parts of Web Push named.
const windowWith = (parts: { serviceWorker?: boolean; userActivation?: boolean; PushManager?: boolean; Notification?: boolean }) =>
  ({
    navigator: { userAgent: 'Test\u0007/1', ...(parts.serviceWorker && { serviceWorker: {} }), ...(parts.userActivation && { userActivation: { isActive: false } }) },
    ...(parts.PushManager && { PushManager: class {} }),
    ...(parts.Notification && { Notification: { permission: 'default' } }),
  }) as unknown as Window & typeof globalThis

describe('windowPushBrowser', () => {
  it('supports push only with a service worker, the Push API, notifications and user activation', () => {
    const all = { serviceWorker: true, userActivation: true, PushManager: true, Notification: true }
    expect(windowPushBrowser(windowWith(all)).supported).toBe(true)
    for (const missing of Object.keys(all)) expect(windowPushBrowser(windowWith({ ...all, [missing]: false })).supported).toBe(false)
  })

  it('names the browser as the server takes it, without control characters', () => {
    expect(windowPushBrowser(windowWith({})).userAgent).toBe('Test/1')
  })
})
