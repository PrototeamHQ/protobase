import { describe, expect, it } from 'vitest'
import { bundleMobile } from './bundle-mobile'

describe('bundleMobile', () => {
  it("names the section's app id and plugins, empty when it gives none, and nothing without a section", () => {
    expect(bundleMobile({ appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.1' } }, false)).toEqual({ appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.1' }, push: false })
    expect(bundleMobile({ appId: 'com.example.shop' }, false)).toEqual({ appId: 'com.example.shop', plugins: {}, push: false })
    expect(bundleMobile(undefined, true)).toBeUndefined()
  })

  it('names whether the app has notifications(), which its native fingerprint counts', () => {
    expect(bundleMobile({ appId: 'com.example.shop' }, true)).toEqual({ appId: 'com.example.shop', plugins: {}, push: true })
  })

  it('refuses a section `protobase mobile` refuses', () => {
    expect(() => bundleMobile({ appId: 'shop' }, false)).toThrow()
    expect(() => bundleMobile({ appId: 'com.example.shop', plugins: { '@capacitor/camera': 8 } }, false)).toThrow('mobile.plugins must map')
  })
})
