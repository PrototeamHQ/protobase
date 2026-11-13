import { describe, expect, it, vi } from 'vitest'
import { createSplashHold } from './splash-hold'

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe('the hold on the launch splash', () => {
  it('hides as soon as the app has drawn with no loading screen', async () => {
    const hide = vi.fn()
    createSplashHold(hide).start()
    await flush()
    expect(hide).toHaveBeenCalledOnce()
  })

  it('stays up while a loading screen shows, then hides once', async () => {
    const hide = vi.fn()
    const splash = createSplashHold(hide)
    const release = splash.hold()
    splash.start()
    await flush()
    expect(hide).not.toHaveBeenCalled()
    release()
    release()
    await flush()
    expect(hide).toHaveBeenCalledOnce()
  })

  it('stays up when one loading screen replaces another in the same render, as the plugins follow /meta', async () => {
    const hide = vi.fn()
    const splash = createSplashHold(hide)
    const meta = splash.hold()
    splash.start()
    await flush()
    meta()
    const plugins = splash.hold()
    await flush()
    expect(hide).not.toHaveBeenCalled()
    plugins()
    await flush()
    expect(hide).toHaveBeenCalledOnce()
  })

  it('does not hide before the app has drawn', async () => {
    const hide = vi.fn()
    createSplashHold(hide).hold()()
    await flush()
    expect(hide).not.toHaveBeenCalled()
  })

  it('hides only once, whatever loads later', async () => {
    const hide = vi.fn()
    const splash = createSplashHold(hide)
    splash.start()
    await flush()
    splash.hold()()
    await flush()
    expect(hide).toHaveBeenCalledOnce()
  })
})
