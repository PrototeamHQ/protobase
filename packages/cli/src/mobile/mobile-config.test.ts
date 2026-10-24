import { describe, expect, it } from 'vitest'
import { checkMobileConfig } from './mobile-config'

describe('checkMobileConfig', () => {
  it('says what to add without a mobile section', () => {
    expect(() => checkMobileConfig(undefined)).toThrow("This project has no mobile section: add `mobile: { appId: 'com.example.app' }`")
  })

  it('takes an app id by Capacitor\'s rule, and extra plugins', () => {
    expect(checkMobileConfig({ appId: 'com.example.Shop_2' })).toEqual({ appId: 'com.example.Shop_2' })
    expect(checkMobileConfig({ appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.0' } })).toEqual({ appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.0' } })
    for (const appId of ['shop', 'com.1shop', 'com.example-shop.app', 'com..shop', 7]) {
      expect(() => checkMobileConfig({ appId }), String(appId)).toThrow('mobile.appId must be a reverse-DNS id')
    }
  })

  it('refuses plugins that are not a record of strings', () => {
    for (const plugins of [['@capacitor/camera'], { '@capacitor/camera': 8 }, 'camera']) {
      expect(() => checkMobileConfig({ appId: 'com.example.shop', plugins })).toThrow("mobile.plugins must map each plugin's npm name")
    }
  })

  it('refuses the packages Protobase pins, and the live-update plugin with its own reason', () => {
    for (const name of ['@capacitor/app', '@capacitor/splash-screen', '@capacitor/core', '@capacitor/cli', '@protobase/mobile']) {
      expect(() => checkMobileConfig({ appId: 'com.example.shop', plugins: { [name]: '8.0.0' } })).toThrow(`mobile.plugins lists ${name}, which comes with Protobase at a fixed version`)
    }
    expect(() => checkMobileConfig({ appId: 'com.example.shop', plugins: { '@capawesome/capacitor-live-update': '8.7.1' } })).toThrow("live updates come with Protobase's updater")
  })

  it('refuses a plugin name that is not an npm package name, before anything joins it into a path', () => {
    for (const name of ['../../..', '@s/..', 'a/b']) {
      expect(() => checkMobileConfig({ appId: 'com.example.shop', plugins: { [name]: 'file:../x' } })).toThrow(`mobile.plugins lists ${JSON.stringify(name)}, which is not an npm package name`)
    }
  })

  it('refuses plugins fetched over a connection that is not secure', () => {
    for (const spec of ['http://host/x.tgz', 'git://host/x.git', 'git+http://host/x.git']) {
      expect(() => checkMobileConfig({ appId: 'com.example.shop', plugins: { x: spec } }), spec).toThrow('over a connection that is not secure')
    }
    expect(checkMobileConfig({ appId: 'com.example.shop', plugins: { x: 'git+https://host/x.git' } }).plugins).toEqual({ x: 'git+https://host/x.git' })
  })
})
