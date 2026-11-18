import { describe, expect, it } from 'vitest'
import { allModules, checkRequiredModules } from './modules-on'

describe('the modules that are on', () => {
  it('may be every one, or a module with the ones it requires', () => {
    expect(() => checkRequiredModules(allModules)).not.toThrow()
    expect(() => checkRequiredModules(['auth', 'organizations'])).not.toThrow()
    expect(() => checkRequiredModules([])).not.toThrow()
  })

  it('are refused with a module on while one it requires is off, naming both', () => {
    expect(() => checkRequiredModules(['organizations'])).toThrow('The organizations module is on while auth, which it requires, is off: turn auth on, or organizations off')
  })
})
