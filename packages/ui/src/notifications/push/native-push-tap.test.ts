import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '../../app/native-auth-fetch'
import { openNativeTap } from './native-push-tap'

const bridge = (plugins: string[]) => {
  const nativePromise = vi.fn<NativeBridge['nativePromise']>(async () => undefined)
  const value: NativeBridge = { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: (name) => plugins.includes(name), nativePromise, addListener: () => ({ remove: async () => {} }) }
  return { bridge: value, nativePromise }
}

describe('openNativeTap', () => {
  it('opens a page of the app through the router, calling no plugin', async () => {
    const { bridge: value, nativePromise } = bridge(['ProtobaseExternal'])
    const navigate = vi.fn()
    await openNativeTap({ kind: 'in-app', path: '/tasks/1?x=1#a' }, { bridge: value, navigate })
    expect(navigate).toHaveBeenCalledWith('/tasks/1?x=1#a')
    expect(nativePromise).not.toHaveBeenCalled()
  })

  it('opens a url of another origin outside the app through ProtobaseExternal, never by navigating the page', async () => {
    const { bridge: value, nativePromise } = bridge(['ProtobaseExternal'])
    const navigate = vi.fn()
    await openNativeTap({ kind: 'browser', url: 'https://elsewhere.example/x' }, { bridge: value, navigate })
    expect(nativePromise).toHaveBeenCalledWith('ProtobaseExternal', 'open', { url: 'https://elsewhere.example/x' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens nothing outside the app without the plugin', async () => {
    const { bridge: value, nativePromise } = bridge([])
    const navigate = vi.fn()
    await openNativeTap({ kind: 'browser', url: 'https://elsewhere.example/x' }, { bridge: value, navigate })
    expect(nativePromise).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
