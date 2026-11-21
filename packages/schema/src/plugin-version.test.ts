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
    expect(inRange('twelve', '>=0.12.0')).toBeUndefined()
  })

  it('places a prerelease, such as a build from main, just before its own release', () => {
    expect(inRange('0.94.4-main.4f8859dd', '>=0.12.9')).toBe(true)
    expect(inRange('0.12.1-beta.1', '>=0.12.0 <0.13.0')).toBe(true)
    expect(inRange('0.12.9-main.4f8859dd', '>=0.13.0')).toBe(false)
    expect(inRange('0.13.0-main.4f8859dd', '>=0.13.0')).toBe(false)
    expect(inRange('0.13.0-main.4f8859dd', '>=0.12.9 <0.13.0')).toBe(true)
    expect(inRange('0.13.0-main.4f8859dd', '>=0.13.0-main.0')).toBe(true)
  })
})

describe('pluginProblem', () => {
  const host = { api: 1, version: '0.12.4', imports: { '@protobase/ui': ['Button', 'definePlugin'], react: ['default', 'useState'] }, extensionPoints: ['components', 'shell.actions'] }
  const uses = { imports: { '@protobase/ui': ['definePlugin'] }, extensionPoints: ['components'] }

  it('loads a plugin of the same plugin API that uses only what the app has, whichever version built it', () => {
    expect(pluginProblem({ api: 1, ...uses }, host)).toBeUndefined()
    expect(pluginProblem({ api: 1, protobase: '>=0.12.0', ...uses }, host)).toBeUndefined()
  })

  it('refuses another plugin API, whatever it uses', () => {
    expect(pluginProblem({ api: 2, ...uses }, host)).toBe('it is built for plugin API 2, and this app has plugin API 1')
  })

  it('refuses a range its author named without the app, or one it cannot read', () => {
    expect(pluginProblem({ api: 1, protobase: '>=0.13.0', ...uses }, host)).toBe('it needs Protobase >=0.13.0, and this app runs 0.12.4')
    expect(pluginProblem({ api: 1, protobase: '^0.12.0', ...uses }, host)).toBe('its Protobase range "^0.12.0" is not one this app reads, such as >=0.12.0')
  })

  it('refuses a plugin that uses an export, a module or an extension point the app lacks, naming each', () => {
    const lacking = { imports: { '@protobase/ui': ['Button', 'NewPicker'], react: ['use'], 'react-dom': ['*'] }, extensionPoints: ['components', 'shell.bell'] }
    expect(pluginProblem({ api: 1, ...lacking }, host)).toBe('it uses what this app does not have: NewPicker from @protobase/ui, use from react, react-dom, the extension point shell.bell')
  })

  it('takes a whole module, as import * takes it, as had when the app shares it', () => {
    expect(pluginProblem({ api: 1, imports: { react: ['*'] }, extensionPoints: [] }, host)).toBeUndefined()
  })
})
