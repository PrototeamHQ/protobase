import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { copyRelease, releaseFile } from './release-output'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

const write = (file: string, content = '') => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

describe('releaseFile', () => {
  it('finds the bundle Gradle left, and throws without one', () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-release-'))
    expect(() => releaseFile(ws, 'android')).toThrow('The Android build left no')
    const aab = path.join(ws, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
    write(aab)
    expect(releaseFile(ws, 'android')).toBe(aab)
  })

  it('takes the one .ipa Xcode exported', () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-release-'))
    const output = path.join(ws, 'ios', 'App', 'output')
    expect(() => releaseFile(ws, 'ios')).toThrow('left 0 .ipa files')
    write(path.join(output, 'App.ipa'))
    write(path.join(output, 'ExportOptions.plist'))
    expect(releaseFile(ws, 'ios')).toBe(path.join(output, 'App.ipa'))
    write(path.join(output, 'Other.ipa'))
    expect(() => releaseFile(ws, 'ios')).toThrow('left 2 .ipa files')
  })
})

describe('copyRelease', () => {
  it('copies the binary under its name into a folder that ignores itself in git', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-release-'))
    write(path.join(ws, 'app-release.aab'), 'signed')
    const target = await copyRelease(path.join(ws, 'app-release.aab'), path.join(ws, 'out'), 'com.example.shop-1.2.3-7')
    expect(target).toBe(path.join(ws, 'out', 'com.example.shop-1.2.3-7.aab'))
    expect(readFileSync(target, 'utf8')).toBe('signed')
    expect(readFileSync(path.join(ws, 'out', '.gitignore'), 'utf8')).toBe('*\n')
  })

  it('leaves a .gitignore already there alone', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-release-'))
    write(path.join(ws, 'App.ipa'))
    write(path.join(ws, 'project', '.gitignore'), 'node_modules\n')
    await copyRelease(path.join(ws, 'App.ipa'), path.join(ws, 'project'), 'com.example.shop-1-1')
    expect(readFileSync(path.join(ws, 'project', '.gitignore'), 'utf8')).toBe('node_modules\n')
  })
})
