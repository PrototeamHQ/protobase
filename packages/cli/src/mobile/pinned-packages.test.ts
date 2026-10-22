import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

describe('pinnedNative', () => {
  it("holds the pinned native packages at their versions, and no @protobase package", () => {
    expect(pinnedNative).toMatchObject({ '@capacitor/core': expect.stringMatching(/^\d+\.\d+\.\d+$/), '@capawesome/capacitor-live-update': expect.any(String) })
    expect(Object.keys(pinnedNative).filter((name) => name.startsWith('@protobase/'))).toEqual([])
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
