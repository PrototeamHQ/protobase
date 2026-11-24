import { describe, expect, it } from 'vitest'
import { allModules, checkRequiredModules, modulesOf } from './modules-on'

describe('the modules that are on', () => {
  it('may be every one, or a module with the ones it requires', () => {
    expect(() => checkRequiredModules(allModules)).not.toThrow()
    expect(() => checkRequiredModules(['auth', 'organizations'])).not.toThrow()
    expect(() => checkRequiredModules([])).not.toThrow()
  })

  it('follow the switches of the features with tables of their own, the others always on', () => {
    const always = ['auth', 'two_factor', 'passkeys', 'sign_in_policy', 'staff_sign_in', 'platform_devices']
    expect(modulesOf({})).toEqual(always)
    expect(modulesOf({ organizations: true, mcp: true, personalAccessTokens: {}, personalMail: ['gmail'] })).toEqual(allModules)
    expect(modulesOf({ openIdProvider: true })).toEqual([...always.slice(0, 5), 'mcp', 'platform_devices'])
    expect(modulesOf({ personalMail: [] })).toEqual(always)
  })

  it('are refused with a module on while one it requires is off, naming both', () => {
    expect(() => checkRequiredModules(['organizations'])).toThrow('The organizations module is on while auth, which it requires, is off: turn auth on, or organizations off')
  })
})
