import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { iosSplashFiles, splashBackgroundContents, splashBackgroundSet, withIosSplash, withSplashImageSize } from './ios-splash'
import { protobaseSplashDir } from './native-splash'
import { writeProtobaseSplash, writeTemplateSplash } from './native-splash-fixture'

const colors = { light: '#f4f3ee', dark: '#0f0f11' }

// @protobase/mobile's launch storyboard, as this repository has it.
const storyboard = fileURLToPath(new URL(`../../../mobile/splash/ios/${iosSplashFiles[0]}`, import.meta.url))

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

  it("draws the app's own splash image at 192 points, its files over Protobase's", async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-ios-splash-'))
    writeProtobaseSplash(ws)
    copyFileSync(storyboard, path.join(protobaseSplashDir(ws, 'ios'), iosSplashFiles[0]!))
    writeTemplateSplash(ws, 'ios')
    const image = [{ file: `${iosSplashFiles[1]}/Contents.json`, content: 'own' }, { file: `${iosSplashFiles[1]}/splash-dark.png`, content: 'own dark' }]
    await withIosSplash(ws, colors, image)
    const at = (file: string) => readFileSync(path.join(ws, 'ios', file), 'utf8')
    for (const { file, content } of image) expect(at(file)).toBe(content)
    expect(at(iosSplashFiles[0]!)).toBe(withSplashImageSize(readFileSync(storyboard, 'utf8'), 192))
    expect(at(path.join(splashBackgroundSet, 'Contents.json'))).toBe(splashBackgroundContents(colors))
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

describe('withSplashImageSize', () => {
  it("draws the storyboard's Splash image at the size, centred as before", () => {
    const sized = withSplashImageSize(readFileSync(storyboard, 'utf8'), 192)
    expect(sized).not.toContain('"128"')
    expect(sized.match(/constant="192"/g)).toHaveLength(2)
    expect(sized).toContain('<image name="Splash" width="192" height="192"/>')
    expect(sized).toContain('secondAttribute="centerY"')
  })

  it('fails on a storyboard that does not draw the image at 128 points', () => {
    expect(() => withSplashImageSize('<document/>', 192)).toThrow('does not draw the Splash image at 128 points')
  })
})
