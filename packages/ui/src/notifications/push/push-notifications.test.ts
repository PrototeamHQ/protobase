import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '../../app/native-auth-fetch'
import { pushNotifications } from './push-notifications'

afterEach(() => vi.unstubAllGlobals())

// An app's native bridge on `platform`, whose build compiled in `plugins`, recording every plugin call.
const bridge = (platform: string, plugins: string[], calls: string[]): NativeBridge => ({
  isNativePlatform: () => true,
  getPlatform: () => platform,
  isPluginAvailable: (name) => plugins.includes(name),
  nativePromise: async (plugin, method) => {
    calls.push(`${plugin}.${method}`)
    return method === 'checkPermissions' ? { receive: 'denied' } : undefined
  },
  addListener: () => ({ remove: async () => {} }),
})

const devices = { register: vi.fn(), remove: vi.fn() }
const meta = async () => ({ appName: 'Shop' })
const user = () => ({ id: 'alice', own: true })

describe('pushNotifications in the app', () => {
  it('offers native push in the Android app whose build compiled the push plugin in', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('indexedDB', {})
    const calls: string[] = []
    const push = pushNotifications({ nativeBridge: bridge('android', ['PushNotifications'], calls), devices, meta, user })
    expect(await push.state()).toBe('blocked')
    expect(calls).toEqual(['PushNotifications.checkPermissions'])
  })

  it('offers native push in the iOS app whose build compiled the push plugin and ProtobasePush in', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('indexedDB', {})
    const calls: string[] = []
    const push = pushNotifications({ nativeBridge: bridge('ios', ['PushNotifications', 'ProtobasePush'], calls), devices, meta, user })
    expect(await push.state()).toBe('blocked')
    expect(calls).toEqual(['PushNotifications.checkPermissions'])
  })

  // Registering without Firebase set up, the build's google-services.json, crashes the Android app; an iOS build from
  // before push names no APNs environment.
  it('offers none, calling no plugin, without the push plugin, or on iOS without ProtobasePush', async () => {
    vi.stubGlobal('window', {})
    for (const [platform, plugins] of [['android', []], ['ios', ['PushNotifications']], ['ios', ['ProtobasePush']]] as const) {
      const calls: string[] = []
      const push = pushNotifications({ nativeBridge: bridge(platform, [...plugins], calls), devices, meta, user })
      expect(await push.state()).toBe('unsupported')
      expect(await push.turnOn()).toBe('unsupported')
      await push.turnOff()
      await push.adopt({ id: 'alice', own: true })
      expect(calls).toEqual([])
    }
    expect(devices.register).not.toHaveBeenCalled()
  })
})
