import { describe, expect, it } from 'vitest'
import type { NativeBridge } from '../app/native-auth-fetch'
import { nativeSignInBridge } from './native-sign-in'

const bridge = (plugins: string[]): NativeBridge => ({
  isNativePlatform: () => true,
  getPlatform: () => 'ios',
  isPluginAvailable: (name) => plugins.includes(name),
  nativePromise: async () => undefined,
  addListener: () => ({ remove: async () => undefined }),
})

describe('nativeSignInBridge', () => {
  it('signs in through the bridge that offers ProtobaseAuth', () => {
    const offering = bridge(['ProtobaseAuth', 'SystemBars'])
    expect(nativeSignInBridge(offering)).toBe(offering)
  })

  it('leaves sign-in to the page in a bridge without ProtobaseAuth, and in a browser', () => {
    expect(nativeSignInBridge(bridge(['SystemBars', 'LiveUpdate']))).toBeUndefined()
    expect(nativeSignInBridge(undefined)).toBeUndefined()
  })
})
