import { describe, expect, it, vi } from 'vitest'
import { protobaseVersion } from '../../plugins/plugin-api'
import type { NativeBridge } from '../native-auth-fetch'
import { appLiveUpdater } from './app-live-updater'

class Refused extends Error {}

const nativeBridge = (plugins: string[]) => {
  const nativePromise = vi.fn(async (_plugin: string, method: string) => (method.startsWith('get') ? { bundleId: null } : undefined))
  const bridge: NativeBridge = { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: (name) => plugins.includes(name), nativePromise, Exception: Refused }
  return { bridge, nativePromise }
}

const userAgent = 'Mozilla/5.0 (Linux; Android 16) ProtobaseNative/0123456789abcdef'
const input = { apiOrigin: 'https://shop.example.com', userAgent, onHold: () => {} }

describe('appLiveUpdater', () => {
  it('is none in a browser, and in a binary without the live updater, such as the iOS app', () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    expect(appLiveUpdater({ ...input, bridge: undefined, fetch })).toBeUndefined()
    expect(appLiveUpdater({ ...input, bridge: nativeBridge(['ProtobaseAuth']).bridge, fetch })).toBeUndefined()
  })

  it("asks the API the page names for this binary's release, with the shell's own version", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ bundleId: null, url: null, required: false }))
    await appLiveUpdater({ ...input, bridge: nativeBridge(['LiveUpdate']).bridge, fetch })!.check(true)
    expect(fetch.mock.calls[0]![0]).toBe(`https://shop.example.com/api/mobile/release?fingerprint=0123456789abcdef&shell_version=${protobaseVersion}`)
  })

  it('only tells the plugin the files started without the fingerprint or the API origin', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const { bridge, nativePromise } = nativeBridge(['LiveUpdate'])
    for (const updater of [appLiveUpdater({ ...input, userAgent: 'Mozilla/5.0', bridge, fetch }), appLiveUpdater({ ...input, apiOrigin: undefined, bridge, fetch })]) {
      await updater!.ready()
      await updater!.check(true)
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(nativePromise.mock.calls.map(([, method]) => method).filter((method) => !method.startsWith('get'))).toEqual(['ready', 'ready'])
  })
})
