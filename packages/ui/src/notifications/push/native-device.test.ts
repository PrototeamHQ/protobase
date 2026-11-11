import { describe, expect, it } from 'vitest'
import type { NativeBridge } from '../../app/native-auth-fetch'
import { nativeDevice } from './native-device'

const token = 'AB12'.repeat(16)

// An app's native bridge on `platform`, whose build compiled in `plugins`, with ProtobasePush naming `environment`.
const bridge = (platform: string, plugins: string[], environment = 'sandbox'): NativeBridge => ({
  isNativePlatform: () => true,
  getPlatform: () => platform,
  isPluginAvailable: (name) => plugins.includes(name),
  nativePromise: async (plugin, method) => {
    expect(`${plugin}.${method}`).toBe('ProtobasePush.apns')
    return { appId: 'com.example.shop', environment }
  },
  addListener: () => ({ remove: async () => {} }),
})

describe('nativeDevice', () => {
  it('registers an Android token as an fcm device, as it is', async () => {
    expect(await nativeDevice(bridge('android', ['PushNotifications']))?.('a:B_c-1')).toEqual({ kind: 'fcm', token: 'a:B_c-1' })
  })

  it('registers an iOS token as an apns device in lowercase hex, with the bundle id and the environment of its build', async () => {
    for (const environment of ['sandbox', 'production']) {
      const device = nativeDevice(bridge('ios', ['PushNotifications', 'ProtobasePush'], environment))
      expect(await device?.(token)).toEqual({ kind: 'apns', token: token.toLowerCase(), appId: 'com.example.shop', environment })
    }
  })

  it('has none without the push plugin, on iOS without ProtobasePush, or on another platform', () => {
    expect(nativeDevice(bridge('android', []))).toBeUndefined()
    expect(nativeDevice(bridge('ios', ['ProtobasePush']))).toBeUndefined()
    expect(nativeDevice(bridge('ios', ['PushNotifications']))).toBeUndefined()
    expect(nativeDevice(bridge('web', ['PushNotifications', 'ProtobasePush']))).toBeUndefined()
  })
})
