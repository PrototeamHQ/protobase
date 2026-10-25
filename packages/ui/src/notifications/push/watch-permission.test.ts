import { describe, expect, it } from 'vitest'
import { watchNotificationPermission } from './watch-permission'

// A window with the events the watch hears, and a Permissions API that answers `query` as given.
const fakeWindow = (query?: () => Promise<PermissionStatus>) => {
  const win = new EventTarget() as EventTarget & { document: EventTarget & { visibilityState: string }; navigator: object }
  win.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  win.navigator = query ? { permissions: { query } } : {}
  return win as unknown as Window & typeof globalThis
}

describe('watchNotificationPermission', () => {
  it("hears the permission's change, a return to the page and focus, until stopped", async () => {
    const status = new EventTarget() as PermissionStatus
    const win = fakeWindow(async () => status)
    let calls = 0
    const stop = watchNotificationPermission(() => calls++, win)
    await Promise.resolve()
    status.dispatchEvent(new Event('change'))
    win.dispatchEvent(new Event('focus'))
    win.document.dispatchEvent(new Event('visibilitychange'))
    expect(calls).toBe(3)
    stop()
    status.dispatchEvent(new Event('change'))
    win.dispatchEvent(new Event('focus'))
    expect(calls).toBe(3)
  })

  it('hears no return to a hidden page, and works without a Permissions API or one that refuses the name', async () => {
    let calls = 0
    for (const win of [fakeWindow(), fakeWindow(async () => Promise.reject(new TypeError('unknown name')))]) {
      const stop = watchNotificationPermission(() => calls++, win)
      await Promise.resolve()
      ;(win.document as unknown as { visibilityState: string }).visibilityState = 'hidden'
      win.document.dispatchEvent(new Event('visibilitychange'))
      win.dispatchEvent(new Event('focus'))
      stop()
    }
    expect(calls).toBe(2)
  })
})
