import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkLocalPins, isUnmet, type LocalPin, localPins } from './local-pins'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// A workspace in `<dir>/project/ws` and a local plugin folder in `<dir>/project/plugin`, with the package.json `manifest`.
const setup = (manifest: unknown) => {
  dir = mkdtempSync(path.join(tmpdir(), 'protobase-pins-'))
  write(path.join(dir, 'project', 'plugin', 'package.json'), JSON.stringify(manifest))
  return path.join(dir, 'project', 'ws')
}
const root = (ws: string, name: string, version: string) => write(path.join(ws, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }))
const unmet = (ws: string) => localPins(ws, { 'my-plugin': '../plugin' }).filter(isUnmet).map(({ name }) => name)

describe('localPins', () => {
  it('reads the pins of the folder npm installs, against the workspace, and the root\'s versions', () => {
    const ws = setup({ dependencies: { 'is-number': '7.0.0' }, optionalDependencies: { fsevents: '^2.0.0' }, peerDependencies: { '@capacitor/core': '^8.0.0' } })
    // Decoys where the spec would point when read against the project or inside the workspace.
    for (const decoy of [path.join(dir, 'plugin'), path.join(ws, 'plugin')]) write(path.join(decoy, 'package.json'), JSON.stringify({ dependencies: { decoy: '1.0.0' } }))
    root(ws, 'is-number', '7.0.0')
    expect(localPins(ws, { '@capacitor/camera': '^8.0.0', 'my-plugin': '../plugin' })).toEqual([
      { key: 'my-plugin', name: 'is-number', spec: '7.0.0', optional: false, installed: '7.0.0' },
      { key: 'my-plugin', name: 'fsevents', spec: '^2.0.0', optional: true, installed: undefined },
      { key: 'my-plugin', name: '@capacitor/core', spec: '^8.0.0', optional: false, installed: undefined },
    ])
  })

  it('refuses a folder without a readable package.json, naming the key', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-pins-'))
    expect(() => localPins(path.join(dir, 'ws'), { 'my-plugin': '../nowhere' })).toThrow('my-plugin is installed from a local folder whose package.json is missing or not JSON')
    write(path.join(dir, 'nowhere', 'package.json'), '{ not json')
    expect(() => localPins(path.join(dir, 'ws'), { 'my-plugin': '../nowhere' })).toThrow('my-plugin is installed from a local folder')
  })

  it('refuses a dependency name that is no package name', () => {
    for (const name of ['../../..', '@s/..']) {
      const ws = setup({ dependencies: { [name]: '1.0.0' } })
      expect(() => localPins(ws, { 'my-plugin': '../plugin' }), name).toThrow(`lists ${JSON.stringify(name)}, which is not an npm package name`)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('isUnmet', () => {
  it('counts every change the root does not hold', () => {
    const ws = setup({ dependencies: { a: '8.7.2', b: '^2.0.0', c: '1.0.0' }, optionalDependencies: { d: '2.0.0' }, peerDependencies: { e: '^3.0.0', f: '1.0.0' }, peerDependenciesMeta: { f: { optional: true } } })
    root(ws, 'a', '8.7.1')
    root(ws, 'b', '1.9.0')
    root(ws, 'd', '1.0.0')
    root(ws, 'e', '2.0.0')
    write(path.join(ws, 'node_modules', 'g', 'package.json'), '{ not json')
    expect(unmet(ws)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('holds a met pin, and an optional one that is absent', () => {
    const ws = setup({ dependencies: { a: '8.7.1', b: '^2.0.0' }, optionalDependencies: { d: '2.0.0' }, peerDependencies: { f: '1.0.0' }, peerDependenciesMeta: { f: { optional: true } } })
    root(ws, 'a', '8.7.1')
    root(ws, 'b', '2.3.0')
    expect(unmet(ws)).toEqual([])
  })

  it('never holds a pin that is no version or range', () => {
    const ws = setup({ dependencies: { a: 'latest', b: 'git+https://user:secret@host/b.git', c: 'npm:other@1.0.0', d: 'file:../d', e: 'https://host/e.tgz' } })
    for (const name of ['a', 'b', 'c', 'd', 'e']) root(ws, name, '1.0.0')
    expect(unmet(ws)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('checkLocalPins', () => {
  const pin = (key: string, name: string, spec: string, installed?: string): LocalPin => ({ key, name, spec, optional: false, installed })

  it('refuses a version pin the root does not hold, naming every pin of it and the root\'s version', () => {
    const pins = [pin('@protobase/mobile', '@capacitor/android', '8.5.3', '8.5.3'), pin('my-plugin', '@capacitor/android', '7.0.0', '8.5.3')]
    expect(() => checkLocalPins(pins)).toThrow('@capacitor/android is pinned at 8.5.3 by @protobase/mobile and 7.0.0 by my-plugin, but .protobase/mobile holds 8.5.3 at its root, where Capacitor reads it: make the pins agree')
    expect(() => checkLocalPins([pin('my-plugin', 'a', '^1.0.0')])).toThrow('holds none at its root')
  })

  it('passes held pins, and skips pins it cannot check, never quoting them', () => {
    expect(() => checkLocalPins([pin('my-plugin', 'a', '^1.0.0', '1.2.0'), pin('my-plugin', 'b', 'git+https://user:secret@host/b.git', '1.0.0')])).not.toThrow()
  })
})
