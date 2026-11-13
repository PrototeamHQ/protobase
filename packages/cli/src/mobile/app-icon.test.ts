import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appIcon } from './app-icon'
import { iconPng } from './icon-source-fixture'
import { iosSplashImages } from './ios-app-icon'
import { nativeIconFiles } from './native-icon'

// The folder of the sharp this repository installs, which @protobase/mobile brings into a workspace.
const sharpDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('sharp')))

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const setUp = async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'protobase-app-icon-'))
  const ws = path.join(dir, 'project', '.protobase', 'mobile')
  mkdirSync(path.join(ws, 'node_modules'), { recursive: true })
  writeFileSync(path.join(dir, 'project', 'icon.png'), await iconPng(1024))
  return { ws, projectDir: path.join(dir, 'project') }
}

describe('appIcon', () => {
  it("draws the app's icon for each platform with the sharp in the workspace", async () => {
    const { ws, projectDir } = await setUp()
    symlinkSync(sharpDir, path.join(ws, 'node_modules', 'sharp'))
    const ios = await appIcon({ ws, projectDir, file: 'icon.png', background: '#0d9488', platform: 'ios' })
    expect(ios.icon.map(({ file }) => file)).toContain(nativeIconFiles.ios[0])
    expect(ios.splash.map(({ file }) => file)).toEqual(iosSplashImages.map(([file]) => file))
    const android = await appIcon({ ws, projectDir, file: 'icon.png', background: '#0d9488', platform: 'android' })
    expect(android.icon.map(({ file }) => file)).toEqual(expect.arrayContaining(nativeIconFiles.android))
    expect(android.splash).toEqual([])
  })

  it('fails on a workspace without sharp, rather than taking the one of the project', async () => {
    const { ws, projectDir } = await setUp()
    await expect(appIcon({ ws, projectDir, file: 'icon.png', background: '#0d9488', platform: 'ios' })).rejects.toThrow(`sharp is not installed in ${ws}`)
  })
})
