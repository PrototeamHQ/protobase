import { describe, expect, it } from 'vitest'
import { inRange, pluginProblem } from './plugin-version'

describe('inRange', () => {
  it('holds when every comparator holds', () => {
    expect(inRange('0.12.4', '>=0.12.0')).toBe(true)
    expect(inRange('0.12.4', '>=0.12.4')).toBe(true)
    expect(inRange('0.12.4', '>=0.12.5')).toBe(false)
    expect(inRange('0.12.4', '>=0.12.0 <0.13.0')).toBe(true)
    expect(inRange('0.13.0', '>=0.12.0 <0.13.0')).toBe(false)
    expect(inRange('1.2.0', '>1.1.9 <=1.2.0')).toBe(true)
    expect(inRange('1.2.0', '1.2.0')).toBe(true)
    expect(inRange('1.2.0', '=1.2.1')).toBe(false)
  })

  it('compares each part as a number', () => {
    expect(inRange('0.10.0', '>=0.9.0')).toBe(true)
    expect(inRange('0.9.0', '>=0.10.0')).toBe(false)
  })

  it('is undefined for a range or version it cannot read', () => {
    for (const range of ['', '^0.12.0', '>=0.12', '0.12.x', '>= 0.12.0', 'latest']) expect(inRange('0.12.0', range)).toBeUndefined()
    expect(inRange('0.12.0-beta.1', '>=0.12.0')).toBeUndefined()
  })
})

describe('pluginProblem', () => {
  const host = { api: 1, version: '0.12.4' }

  it('loads a plugin of the same plugin API whose range holds the app', () => {
    expect(pluginProblem({ api: 1, protobase: '>=0.12.0' }, host)).toBeUndefined()
  })

  it('refuses another plugin API, whatever the range', () => {
    expect(pluginProblem({ api: 2, protobase: '>=0.12.0' }, host)).toBe('it is built for plugin API 2, and this app has plugin API 1')
  })

  it('refuses a range without the app, or one it cannot read', () => {
    expect(pluginProblem({ api: 1, protobase: '>=0.13.0' }, host)).toBe('it needs Protobase >=0.13.0, and this app runs 0.12.4')
    expect(pluginProblem({ api: 1, protobase: '^0.12.0' }, host)).toBe('its Protobase range "^0.12.0" is not one this app reads, such as >=0.12.0')
  })
})
