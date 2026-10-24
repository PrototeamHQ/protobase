import { describe, expect, it } from 'vitest'
import { appIdProblem, isAppId } from './app-id'

describe('isAppId', () => {
  it('takes an id iOS and Android both accept', () => {
    for (const appId of ['com.example.shop', 'net.protobase.mobilelab', 'com.Example.Shop2', 'a.b']) {
      expect(isAppId(appId), appId).toBe(true)
    }
  })

  it('refuses an id either platform refuses, and names the allowed characters', () => {
    for (const appId of ['shop', 'com.1shop', 'com..shop', '.com.shop', 'com.shop.', 'com.example_shop', 'com.example-shop', 'com.ex ample', 'com.exämple', 7, undefined]) {
      expect(isAppId(appId), String(appId)).toBe(false)
      expect(appIdProblem(appId), String(appId)).toContain('each starting with a letter and holding only letters and digits (no underscores or hyphens)')
    }
  })

})

describe('appIdProblem', () => {
  it('suggests the id with what neither platform allows taken out', () => {
    expect(appIdProblem('net.protobase.mobile_lab')).toContain('such as net.protobase.mobilelab, not "net.protobase.mobile_lab"')
    expect(appIdProblem('com.my-shop.1app')).toContain('such as com.myshop.app,')
    expect(appIdProblem('com..shop')).toContain('such as com.shop,')
    expect(appIdProblem('shop')).toContain('such as com.example.app,')
    expect(appIdProblem(7)).toContain('such as com.example.app, not 7')
  })
})
