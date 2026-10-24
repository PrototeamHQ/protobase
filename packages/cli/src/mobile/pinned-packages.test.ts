import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import mobilePackage from '../../../mobile/package.json' with { type: 'json' }
import { checkInstalledPlugins, pinnedNative, pinnedPackages } from './pinned-packages'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const install = (key: string, name: string) => {
  mkdirSync(path.join(dir, 'node_modules', key), { recursive: true })
  writeFileSync(path.join(dir, 'node_modules', key, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
}

describe('pinnedPackages', () => {
  it('holds @protobase/mobile and every package it pins', () => {
    expect([...pinnedPackages]).toEqual(expect.arrayContaining(['@protobase/mobile', '@capacitor/core', '@capacitor/app', '@capawesome/capacitor-live-update']))
  })
})

/** A hash of the native sources @protobase/mobile publishes: its `files` under android/ and ios/, path and content. */
const nativeSources = () => {
  const root = path.join(import.meta.dirname, '../../../mobile')
  const walk = (file: string): string[] => (statSync(path.join(root, file)).isDirectory() ? readdirSync(path.join(root, file)).flatMap((name) => walk(path.posix.join(file, name))) : [file])
  const files = mobilePackage.files.filter((file) => /^(android|ios)\//.test(file)).flatMap((file) => walk(file.replace(/\/$/, ''))).sort()
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file}\0`).update(readFileSync(path.join(root, file))).update('\0')
  return hash.digest('hex')
}

describe('pinnedNative', () => {
  it('holds the pinned native packages at their versions, and @protobase/mobile at its native contract', () => {
    expect(pinnedNative).toMatchObject({ '@capacitor/core': expect.stringMatching(/^\d+\.\d+\.\d+$/), '@capawesome/capacitor-live-update': expect.any(String) })
    expect(pinnedNative['@protobase/mobile']).toBe(`native-${mobilePackage.nativeContract}`)
    expect(Object.keys(pinnedNative).filter((name) => name.startsWith('@protobase/'))).toEqual(['@protobase/mobile'])
  })

  it('names the native sources @protobase/mobile publishes by its native contract', () => {
    const recorded = { contract: 2, sources: 'd15a5bc11de7049dffb347fd5909902bc1320315a1da92a1e5570d37ddd1f71f' }
    expect({ contract: mobilePackage.nativeContract, sources: nativeSources() }, 'the native sources of @protobase/mobile changed: raise nativeContract in its package.json, then record both here').toEqual(recorded)
  })
})

describe('checkInstalledPlugins', () => {
  it('refuses a plugin whose installed package is a pinned one under another name', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-plugins-'))
    install('my-updater', '@capawesome/capacitor-live-update')
    install('x', '@capacitor/app')
    install('@capacitor/camera', '@capacitor/camera')
    expect(() => checkInstalledPlugins(dir, ['my-updater'])).toThrow("mobile.plugins lists my-updater, @capawesome/capacitor-live-update: live updates come with Protobase's updater")
    expect(() => checkInstalledPlugins(dir, ['x'])).toThrow('mobile.plugins lists x, which installs @capacitor/app, which comes with Protobase at a fixed version')
    expect(() => checkInstalledPlugins(dir, ['@capacitor/camera'])).not.toThrow()
  })

  it('refuses a plugin missing from the workspace, even when the project has a package of that name', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-plugins-'))
    const ws = path.join(dir, '.protobase', 'mobile')
    mkdirSync(ws, { recursive: true })
    install('x', '@capawesome/capacitor-live-update')
    expect(() => checkInstalledPlugins(ws, ['x'])).toThrow(`x is not installed in ${ws}`)
  })
})
