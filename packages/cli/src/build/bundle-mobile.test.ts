import { describe, expect, it } from 'vitest'
import { bundleMobile } from './bundle-mobile'

describe('bundleMobile', () => {
  it("names the section's plugins, empty when it gives none, and nothing without a section", () => {
    expect(bundleMobile({ appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.1' } })).toEqual({ plugins: { '@capacitor/camera': '^8.0.1' } })
    expect(bundleMobile({ appId: 'com.example.shop' })).toEqual({ plugins: {} })
    expect(bundleMobile(undefined)).toBeUndefined()
  })

  it('refuses a section `protobase mobile` refuses', () => {
    expect(() => bundleMobile({ appId: 'shop' })).toThrow()
    expect(() => bundleMobile({ appId: 'com.example.shop', plugins: { '@capacitor/camera': 8 } })).toThrow('mobile.plugins must map')
  })
})
