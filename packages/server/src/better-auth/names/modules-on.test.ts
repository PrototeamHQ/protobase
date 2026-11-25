import { describe, expect, it } from 'vitest'
import { allModules, checkRequiredModules, modulesOf } from './modules-on'

describe('the modules that are on', () => {
  it('may be every one, or a module with the ones it requires', () => {
    expect(() => checkRequiredModules(allModules)).not.toThrow()
    expect(() => checkRequiredModules(['auth', 'organizations'])).not.toThrow()
    expect(() => checkRequiredModules([])).not.toThrow()
  })

  it('follow the switches of the features with tables of their own, the others always on', () => {
    const always = ['auth', 'two_factor', 'passkeys', 'sign_in_policy', 'staff_sign_in']
    expect(modulesOf({})).toEqual(always)
    expect(modulesOf({ organizations: true, mcp: true, personalAccessTokens: {}, personalMail: ['gmail'], signInDevices: true })).toEqual(allModules)
    expect(modulesOf({ openIdProvider: true })).toEqual([...always, 'mcp'])
    expect(modulesOf({ personalMail: [] })).toEqual(always)
  })

  it('have device sign-in on only when the config says a provider signs in devices', () => {
    expect(modulesOf({ signInProviders: [{}, { devices: false }] })).not.toContain('platform_devices')
    expect(modulesOf({ signInDevices: false })).not.toContain('platform_devices')
    expect(modulesOf({ signInProviders: [{}, { devices: true }] })).toContain('platform_devices')
    expect(modulesOf({ signInDevices: true })).toContain('platform_devices')
  })

  it('are refused with a module on while one it requires is off, naming both', () => {
    expect(() => checkRequiredModules(['organizations'])).toThrow('The organizations module is on while auth, which it requires, is off: turn auth on, or organizations off')
  })
})
