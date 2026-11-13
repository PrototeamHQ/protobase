import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { iosSplashFiles, splashBackgroundContents, splashBackgroundSet, withIosSplash } from './ios-splash'
import { writeProtobaseSplash, writeTemplateSplash } from './native-splash-fixture'

const colors = { light: '#f4f3ee', dark: '#0f0f11' }

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

describe('splashBackgroundContents', () => {
  it('is the light colour, and the dark one in dark mode', () => {
    expect(JSON.parse(splashBackgroundContents(colors))).toEqual({
      colors: [
        { color: { 'color-space': 'srgb', components: { red: '0xF4', green: '0xF3', blue: '0xEE', alpha: '1.000' } }, idiom: 'universal' },
        { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: { 'color-space': 'srgb', components: { red: '0x0F', green: '0x0F', blue: '0x11', alpha: '1.000' } }, idiom: 'universal' },
      ],
      info: { author: 'xcode', version: 1 },
    })
  })
})

describe('withIosSplash', () => {
  it("replaces the template's launch screen with Protobase's, on the app's background", async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-ios-splash-'))
    writeProtobaseSplash(ws)
    writeTemplateSplash(ws, 'ios')
    await withIosSplash(ws, colors)
    const at = (file: string) => path.join(ws, 'ios', file)
    expect(readFileSync(at(iosSplashFiles[0]!), 'utf8')).toBe('protobase')
    expect(readFileSync(at(path.join(iosSplashFiles[1]!, 'Contents.json')), 'utf8')).toBe('protobase')
    expect(existsSync(at(path.join(iosSplashFiles[1]!, 'splash-2732x2732.png')))).toBe(false)
    expect(readFileSync(at(path.join(splashBackgroundSet, 'Contents.json')), 'utf8')).toBe(splashBackgroundContents(colors))
  })

  it('fails on a template without the launch screen', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-ios-splash-'))
    writeProtobaseSplash(ws)
    writeTemplateSplash(ws, 'ios')
    rmSync(path.join(ws, 'ios', iosSplashFiles[0]!))
    await expect(withIosSplash(ws, colors)).rejects.toThrow(`The generated ios project has no ${iosSplashFiles[0]}`)
  })

  it('fails on an @protobase/mobile without the splash screen', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-ios-splash-'))
    writeTemplateSplash(ws, 'ios')
    await expect(withIosSplash(ws, colors)).rejects.toThrow(`@protobase/mobile has no ios/${iosSplashFiles[0]} of Protobase's splash screen`)
  })
})
