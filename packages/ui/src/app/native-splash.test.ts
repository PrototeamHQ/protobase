import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from './native-auth-fetch'
import { nativeSplash } from './native-splash'

const bridge = (plugins: string[]) => {
  const nativePromise = vi.fn(async () => undefined)
  const native = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: (name: string) => plugins.includes(name), nativePromise, addListener: () => ({ remove: async () => {} }) } as NativeBridge
  return { native, nativePromise }
}

describe('nativeSplash', () => {
  it('is none in a browser and in a binary without the splash plugin', () => {
    expect(nativeSplash(undefined)).toBeUndefined()
    expect(nativeSplash(bridge(['LiveUpdate']).native)).toBeUndefined()
  })

  it('shows the splash until it is hidden', async () => {
    const { native, nativePromise } = bridge(['SplashScreen'])
    const splash = nativeSplash(native)!
    await splash.show()
    await splash.hide()
    expect(nativePromise.mock.calls).toEqual([
      ['SplashScreen', 'show', { autoHide: false }],
      ['SplashScreen', 'hide', {}],
    ])
  })
})
